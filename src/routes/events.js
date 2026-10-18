import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import Event from '../models/Event.js';
import Assignment from '../models/Assignment.js';
import Registration from '../models/Registration.js';
import User from '../models/User.js';
import { requireAuth, allowRoles } from '../middleware/auth.js';
import { asyncHandler, ok, AppError } from '../utils/http.js';
import { validate } from '../middleware/validate.js';
import { notify } from '../utils/notify.js';

/*
 * SIMPLE EVENT FLOW
 *  1. Teacher (or admin) creates an event  -> it is published immediately, students see it.
 *  2. Students join as participant (instant) or apply to volunteer (teacher approves).
 *  3. Teacher can also add any student directly as participant / volunteer from the event page.
 * There is no separate approval step any more.
 */

const router = Router();
router.use(requireAuth);

const isTeacher = (user) => ['admin', 'coordinator'].includes(user?.role);
const emitTeachers = (name, data) => globalThis.campusCrewIo?.to('teachers').emit(name, data);

// Events created before this change may be stuck as "draft"/"pending_approval".
// Publish them once so students can finally see them.
let publishedOldEvents = false;
router.use(
  asyncHandler(async (_req, _res, next) => {
    if (!publishedOldEvents) {
      publishedOldEvents = true;
      try {
        await Event.updateMany({ status: { $in: ['draft', 'pending_approval'] } }, { $set: { status: 'published' } });
      } catch (err) {
        publishedOldEvents = false;
        console.error('Could not publish old events:', err.message);
      }
    }
    next();
  })
);

const eventInput = z.object({
  title: z.string().trim().min(3).max(140),
  description: z.string().max(5000).optional(),
  category: z.string().max(80).optional(),
  venue: z.string().max(180).optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  registrationDeadline: z.coerce.date().optional(),
  coordinatorIds: z.array(z.string()).optional(),
  status: z.enum(['draft', 'pending_approval', 'published', 'ongoing', 'completed', 'cancelled']).optional(),
});

const loadEvent = async (id, user) => {
  if (!mongoose.isValidObjectId(id)) throw new AppError(404, 'Event not found');
  const event = await Event.findById(id);
  if (!event || (!isTeacher(user) && event.status !== 'published')) throw new AppError(404, 'Event not found');
  return event;
};

/* ---------- list / create / read / update ---------- */

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const q = isTeacher(req.user) ? {} : { status: 'published' };
    if (req.query.status && isTeacher(req.user)) q.status = String(req.query.status);
    const events = await Event.find(q)
      .sort({ startDate: 1 })
      .limit(200)
      .populate('createdBy', 'name')
      .populate('coordinatorIds', 'name');
    ok(res, { events });
  })
);

router.post(
  '/',
  allowRoles('admin', 'coordinator'),
  validate(eventInput),
  asyncHandler(async (req, res) => {
    if (req.body.endDate < req.body.startDate) throw new AppError(400, 'End time must be after the start time');
    const event = await Event.create({
      ...req.body,
      status: 'published',
      createdBy: req.user.id,
      coordinatorIds: [req.user.id],
    });
    globalThis.campusCrewIo?.emit('event:created', { eventId: event.id });
    ok(res, { event }, 'Event published. Students can see it now.', 201);
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const found = await loadEvent(req.params.id, req.user);
    const event = await Event.findById(found.id).populate('createdBy', 'name').populate('coordinatorIds', 'name');
    const mine = await Registration.find({ eventId: found.id, userId: req.user.id }).select('type status');
    ok(res, { event, mine });
  })
);

router.patch(
  '/:id',
  allowRoles('admin', 'coordinator'),
  validate(eventInput.partial()),
  asyncHandler(async (req, res) => {
    const event = await loadEvent(req.params.id, req.user);
    Object.assign(event, req.body);
    await event.save();
    ok(res, { event }, 'Event updated');
  })
);

// Kept for older clients. Approving publishes, rejecting cancels.
router.post(
  '/:id/decision',
  allowRoles('admin', 'coordinator'),
  validate(z.object({ decision: z.enum(['approve', 'reject']) })),
  asyncHandler(async (req, res) => {
    const event = await loadEvent(req.params.id, req.user);
    event.status = req.body.decision === 'approve' ? 'published' : 'cancelled';
    await event.save();
    ok(res, { event }, 'Decision saved');
  })
);

/* ---------- student: join / leave ---------- */

router.post(
  '/:id/registrations',
  validate(z.object({ type: z.enum(['participant', 'volunteer_applicant']), note: z.string().max(1000).optional() })),
  asyncHandler(async (req, res) => {
    if (isTeacher(req.user)) throw new AppError(400, 'Teachers manage events. Use "Add participant" or "Add volunteer" on the event page.');
    const event = await loadEvent(req.params.id, req.user);
    if (event.registrationDeadline && event.registrationDeadline < new Date()) {
      throw new AppError(400, 'Registration deadline has passed');
    }
    const { type } = req.body;
    const key = { eventId: event.id, userId: req.user.id, type };
    const existing = await Registration.findOne(key);
    if (existing && ['approved', 'pending'].includes(existing.status)) {
      return ok(res, { registration: existing }, 'You are already registered for this');
    }
    if (existing && existing.status === 'rejected') throw new AppError(400, 'Your earlier application was not accepted');

    const status = type === 'participant' ? 'approved' : 'pending';
    const registration = await Registration.findOneAndUpdate(
      key,
      { $set: { status, note: req.body.note || '' }, $unset: { reviewedBy: '' } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    if (type === 'volunteer_applicant') {
      const teacherIds = new Set(event.coordinatorIds.map(String));
      teacherIds.add(String(event.createdBy));
      for (const id of teacherIds) {
        await notify(id, 'volunteer_application', 'New volunteer application', `${req.user.name} applied to volunteer for ${event.title}.`, registration._id);
      }
    }
    emitTeachers('registration:new', { eventId: event.id });
    ok(res, { registration }, type === 'participant' ? 'You are registered!' : 'Application sent. Your teacher will review it.', 201);
  })
);

router.delete(
  '/:id/registrations/mine/:type',
  asyncHandler(async (req, res) => {
    const type = req.params.type === 'volunteer' ? 'volunteer_applicant' : req.params.type;
    if (!['participant', 'volunteer_applicant'].includes(type)) throw new AppError(400, 'Unknown registration type');
    const r = await Registration.findOne({ eventId: req.params.id, userId: req.user.id, type });
    if (!r) throw new AppError(404, 'You are not registered for this');
    r.status = 'cancelled';
    await r.save();
    if (type === 'volunteer_applicant') {
      await Assignment.updateOne({ eventId: req.params.id, volunteerId: req.user.id }, { $set: { status: 'removed' } });
    }
    emitTeachers('registration:new', { eventId: req.params.id });
    ok(res, { registration: r }, 'Removed');
  })
);

/* ---------- teacher: see and manage people ---------- */

router.get(
  '/:id/registrations',
  allowRoles('admin', 'coordinator'),
  asyncHandler(async (req, res) => {
    const event = await loadEvent(req.params.id, req.user);
    const rows = await Registration.find({ eventId: event.id, status: { $in: ['pending', 'approved', 'rejected'] } })
      .sort({ createdAt: 1 })
      .populate('userId', 'name collegeId department academicYear skills');
    const assignments = await Assignment.find({ eventId: event.id, status: { $ne: 'removed' } }).select('volunteerId workRole');
    const roleByUser = new Map(assignments.map((a) => [String(a.volunteerId), a.workRole]));
    const registrations = rows
      .filter((r) => r.userId)
      .map((r) => ({ ...r.toObject(), workRole: roleByUser.get(String(r.userId._id)) || '' }));
    ok(res, { registrations });
  })
);

// Teacher adds a student straight to the event (the "Add participant" / "Add volunteer" buttons).
router.post(
  '/:id/members',
  allowRoles('admin', 'coordinator'),
  validate(
    z.object({
      userId: z.string().min(1),
      type: z.enum(['participant', 'volunteer']),
      workRole: z.string().trim().max(100).optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const event = await loadEvent(req.params.id, req.user);
    if (!mongoose.isValidObjectId(req.body.userId)) throw new AppError(400, 'Invalid student');
    const student = await User.findById(req.body.userId).select('name accountStatus');
    if (!student || student.accountStatus !== 'active') throw new AppError(404, 'Student not found');

    const regType = req.body.type === 'volunteer' ? 'volunteer_applicant' : 'participant';
    const registration = await Registration.findOneAndUpdate(
      { eventId: event.id, userId: student.id, type: regType },
      { $set: { status: 'approved', reviewedBy: req.user.id } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    let workRole = '';
    if (regType === 'volunteer_applicant') {
      workRole = req.body.workRole || 'Volunteer';
      await Assignment.findOneAndUpdate(
        { eventId: event.id, volunteerId: student.id },
        { eventId: event.id, volunteerId: student.id, workRole, responsibilities: [], assignedBy: req.user.id, status: 'assigned', assignedAt: new Date() },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
    await notify(
      student.id,
      'event_added',
      regType === 'participant' ? 'You were added to an event' : 'You are a volunteer',
      regType === 'participant' ? `You are on the participant list for ${event.title}.` : `You were added as a volunteer (${workRole}) for ${event.title}.`,
      event._id
    );
    globalThis.campusCrewIo?.to(`user:${student.id}`).emit('registration:updated', { eventId: event.id });
    ok(res, { registration }, `${student.name} added`, 201);
  })
);

// Teacher approves / rejects an application.
router.patch(
  '/:id/registrations/:registrationId',
  allowRoles('admin', 'coordinator'),
  validate(
    z.object({
      decision: z.enum(['approve', 'reject']),
      workRole: z.string().max(100).optional(),
      responsibilities: z.array(z.string().max(250)).max(30).optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const event = await loadEvent(req.params.id, req.user);
    const r = await Registration.findOne({ _id: req.params.registrationId, eventId: event.id });
    if (!r) throw new AppError(404, 'Registration not found');
    r.status = req.body.decision === 'approve' ? 'approved' : 'rejected';
    r.reviewedBy = req.user.id;
    await r.save();
    if (r.type === 'volunteer_applicant') {
      if (r.status === 'approved') {
        await Assignment.findOneAndUpdate(
          { eventId: event.id, volunteerId: r.userId },
          { eventId: event.id, volunteerId: r.userId, workRole: req.body.workRole || 'Volunteer', responsibilities: req.body.responsibilities || [], assignedBy: req.user.id, status: 'assigned', assignedAt: new Date() },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      } else {
        await Assignment.updateOne({ eventId: event.id, volunteerId: r.userId }, { $set: { status: 'removed' } });
      }
    }
    await notify(r.userId, 'application_decision', 'Volunteer application updated', `Your application for ${event.title} was ${r.status}.`, r._id);
    globalThis.campusCrewIo?.to(`user:${r.userId}`).emit('registration:updated', { registrationId: r.id, status: r.status });
    ok(res, { registration: r }, 'Saved');
  })
);

// Teacher removes someone from the event.
router.delete(
  '/:id/members/:registrationId',
  allowRoles('admin', 'coordinator'),
  asyncHandler(async (req, res) => {
    const event = await loadEvent(req.params.id, req.user);
    const r = await Registration.findOne({ _id: req.params.registrationId, eventId: event.id });
    if (!r) throw new AppError(404, 'Registration not found');
    r.status = 'cancelled';
    await r.save();
    if (r.type === 'volunteer_applicant') {
      await Assignment.updateOne({ eventId: event.id, volunteerId: r.userId }, { $set: { status: 'removed' } });
    }
    await notify(r.userId, 'event_removed', 'Event update', `You were removed from ${event.title}.`, event._id);
    globalThis.campusCrewIo?.to(`user:${r.userId}`).emit('registration:updated', { registrationId: r.id, status: 'cancelled' });
    ok(res, {}, 'Removed');
  })
);

/* ---------- assignments (unchanged) ---------- */

router.post(
  '/:id/assignments',
  allowRoles('admin', 'coordinator'),
  validate(z.object({ volunteerId: z.string(), workRole: z.string().trim().min(2).max(100), responsibilities: z.array(z.string().max(250)).max(30).optional() })),
  asyncHandler(async (req, res) => {
    const event = await loadEvent(req.params.id, req.user);
    const a = await Assignment.findOneAndUpdate(
      { eventId: event.id, volunteerId: req.body.volunteerId },
      { eventId: event.id, volunteerId: req.body.volunteerId, workRole: req.body.workRole, responsibilities: req.body.responsibilities || [], assignedBy: req.user.id, status: 'assigned', assignedAt: new Date() },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    await notify(a.volunteerId, 'assignment_created', 'New volunteer assignment', `You have been assigned as ${a.workRole} for ${event.title}.`, a._id);
    globalThis.campusCrewIo?.to(`user:${a.volunteerId}`).emit('assignment:updated', { assignmentId: a.id });
    ok(res, { assignment: a }, 'Volunteer assigned', 201);
  })
);

router.get(
  '/:id/assignments',
  asyncHandler(async (req, res) => {
    const event = await loadEvent(req.params.id, req.user);
    const rows = await Assignment.find({ eventId: event.id, status: { $ne: 'removed' } })
      .populate('volunteerId', 'name department academicYear skills avatarUrl')
      .populate('assignedBy', 'name');
    ok(res, { assignments: rows });
  })
);

export default router;
