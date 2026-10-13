import mongoose from 'mongoose';
export function notFound(req, _res, next) { const e = new Error(`Route not found: ${req.method} ${req.originalUrl}`); e.status = 404; next(e); }
export function errorHandler(err, _req, res, _next) {
  if (err instanceof mongoose.Error.ValidationError) return res.status(400).json({ success: false, message: err.message, data: null });
  if (err?.code === 11000) return res.status(409).json({ success: false, message: 'A record with this value already exists', data: null });
  const status = err.status || 500; if (status >= 500) console.error(err);
  res.status(status).json({ success: false, message: status >= 500 && process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message || 'Internal server error', data: null });
}
