import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import User from '../models/User.js';
import Volunteer from '../models/Volunteer.js';
import Task from '../models/Task.js';
import { requireAuth, allowRoles } from '../middleware/auth.js';
import { asyncHandler, ok, AppError } from '../utils/http.js';
import { validate } from '../middleware/validate.js';
import { notify } from '../utils/notify.js';

const router = Router();
router.use(requireAuth);

const emitTeachers = (event, data) => globalThis.campusCrewIo?.to('teachers').emit(event, data);

// Student: am I enrolled?
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const v = await Volunteer.findOne({ studentId: req.user.id, status: 'active' });
    ok(res, { enrolled: !!v, volunteer: v });
  })
);

// Student: add my name as a volunteer
router.post(
  '/enroll',
  validate(z.object({ note: z.string().max(300).optional() })),
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'volunteer') throw new AppError(403, 'Switch to the student role to enroll as a volunteer');
    const existing = await Volunteer.findOne({ studentId: req.user.id, status: 'active' });
    if (existing) return ok(res, { enrolled: true, volunteer: existing }, 'You are already a volunteer');

    const v = await Volunteer.findOneAndUpdate(
      { studentId: req.user.id },
      { $set: { status: 'active', note: req.body.note || '', enrolledAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    const teachers = await User.find({
      $or: [{ role: { $in: ['coordinator', 'admin'] } }, { isTeacher: true }],
      accountStatus: 'active',
    }).select('_id');
    await Promise.all(
      teachers.map((t) => notify(t.id, 'volunteer_enrolled', 'New volunteer', `${req.user.name} enrolled as a volunteer.`, v._id))
    );
    emitTeachers('volunteer:enrolled', { studentId: req.user.id, name: req.user.name });
    ok(res, { enrolled: true, volunteer: v }, 'You are now a volunteer', 201);
  })
);

// Student: withdraw
router.delete(
  '/enroll',
  asyncHandler(async (req, res) => {
    await Volunteer.findOneAndUpdate({ studentId: req.user.id }, { status: 'withdrawn' });
    emitTeachers('volunteer:withdrawn', { studentId: req.user.id, name: req.user.name });
    ok(res, { enrolled: false }, 'You are no longer a volunteer');
  })
);

// Teacher: list volunteers with their tasks
router.get(
  '/',
  allowRoles('coordinator', 'admin'),
  asyncHandler(async (_req, res) => {
    const vols = await Volunteer.find({ status: 'active' })
      .sort({ enrolledAt: -1 })
      .populate('studentId', 'name collegeId department academicYear skills avatarUrl');
    const live = vols.filter((v) => v.studentId);
    const tasks = await Task.find({ volunteerId: { $in: live.map((v) => v.studentId._id) } }).sort({ createdAt: -1 });
    const byStudent = {};
    for (const t of tasks) (byStudent[String(t.volunteerId)] ||= []).push(t);
    ok(res, {
      volunteers: live.map((v) => ({
        _id: v.id,
        enrolledAt: v.enrolledAt,
        note: v.note,
        student: v.studentId,
        tasks: byStudent[String(v.studentId._id)] || [],
      })),
    });
  })
);

// Teacher: write a task for one volunteer
router.post(
  '/:studentId/tasks',
  allowRoles('coordinator', 'admin'),
  validate(
    z.object({
      title: z.string().trim().min(2).max(160),
      description: z.string().max(2000).optional(),
      dueDate: z.coerce.date().optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const { studentId } = req.params;
    if (!mongoose.isValidObjectId(studentId)) throw new AppError(400, 'Invalid student id');
    const v = await Volunteer.findOne({ studentId, status: 'active' });
    if (!v) throw new AppError(404, 'This student is not an active volunteer');
    const task = await Task.create({ ...req.body, volunteerId: studentId, createdBy: req.user.id });
    await notify(studentId, 'task_created', 'New task from your teacher', task.title, task._id);
    globalThis.campusCrewIo?.to(`user:${studentId}`).emit('task:updated', { taskId: task.id });
    emitTeachers('volunteer:updated', { studentId });
    ok(res, { task }, 'Task assigned', 201);
  })
);

export default router;
