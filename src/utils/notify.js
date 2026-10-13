import Notification from '../models/Notification.js';
export async function notify(userId, type, title, message, referenceId) {
  if (!userId) return null;
  const item = await Notification.create({ userId, type, title, message, referenceId });
  const io = globalThis.campusCrewIo; if (io) io.to(`user:${userId}`).emit('notification:new', item);
  return item;
}
