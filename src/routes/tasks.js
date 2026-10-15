import { Router } from 'express';
import { z } from 'zod';
import Task from '../models/Task.js';
import Assignment from '../models/Assignment.js';
import Event from '../models/Event.js';
import { requireAuth, allowRoles } from '../middleware/auth.js';
import { asyncHandler, ok, AppError } from '../utils/http.js';
import { validate } from '../middleware/validate.js';
import { notify } from '../utils/notify.js';

const router = Router();
router.use(requireAuth);

const manages = (event, user) =>
  user.role === 'admin' ||
  event.coordinatorIds.some((id) => String(id) === String(user.id)) ||
  String(event.createdBy) === String(user.id);

router.get(
  '/mine',
  asyncHandler(async (req, res) => {
    const assignments = await Assignment.find({ volunteerId: req.user.id, status: { $ne: 'removed' } }).select('_id');
    const tasks = await Task.find({
      $or: [{ volunteerId: req.user.id }, { assignmentId: { $in: assignments.map((a) => a._id) } }],
    })
      .populate('eventId', 'title startDate')
      .sort({ createdAt: -1 });
    ok(res, { tasks });
  })
);

// Event-based task (original flow). Teachers can also assign tasks directly
// from the Volunteers page (POST /volunteers/:studentId/tasks).
router.post(
  '/',
  allowRoles('admin', 'coordinator'),
  validate(
    z.object({
      eventId: z.string(),
      assignmentId: z.string(),
      title: z.string().trim().min(2).max(160),
      description: z.string().max(2000).optional(),
      dueDate: z.coerce.date().optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const a = await Assignment.findById(req.body.assignmentId);
    if (!a || String(a.eventId) !== req.body.eventId) throw new AppError(404, 'Assignment not found');
    const event = await Event.findById(req.body.eventId);
    if (!event) throw new AppError(404, 'Event not found');
    if (req.user.role === 'coordinator' && !manages(event, req.user)) throw new AppError(403, 'You do not manage this event');
    const task = await Task.create({ ...req.body, volunteerId: a.volunteerId, createdBy: req.user.id });
    await notify(a.volunteerId, 'task_created', 'New task assigned', `A task was created: ${task.title}`, task._id);
    globalThis.campusCrewIo?.to(`user:${a.volunteerId}`).emit('task:updated', { taskId: task.id });
    ok(res, { task }, 'Task created', 201);
  })
);

router.patch(
  '/:id',
  validate(
    z.object({
      status: z.enum(['todo', 'in_progress', 'completed']).optional(),
      title: z.string().min(2).max(160).optional(),
      description: z.string().max(2000).optional(),
      dueDate: z.coerce.date().optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const task = await Task.findById(req.params.id).populate('assignmentId');
    if (!task) throw new AppError(404, 'Task not found');
    const ownerId = task.volunteerId || task.assignmentId?.volunteerId;
    const isOwner = String(ownerId) === String(req.user.id);
    if (!isOwner && !['admin', 'coordinator'].includes(req.user.role)) throw new AppError(403, 'You cannot update this task');
    if (isOwner && req.user.role === 'volunteer' && Object.keys(req.body).some((k) => k !== 'status')) {
      throw new AppError(403, 'Volunteers can only update task status');
    }
    task.set(req.body);
    await task.save();
    if (req.body.status) {
      await notify(task.createdBy, 'task_status_changed', 'Task status changed', `${task.title} is now ${task.status.replace('_', ' ')}.`, task._id);
    }
    const io = globalThis.campusCrewIo;
    if (ownerId) io?.to(`user:${ownerId}`).emit('task:updated', { taskId: task.id, status: task.status });
    io?.to('teachers').emit('volunteer:updated', { studentId: String(ownerId) });
    ok(res, { task });
  })
);

export default router;
