export const ok = (res, data = null, message = 'Success', status = 200) =>
  res.status(status).json({ success: true, message, data });
export class AppError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
