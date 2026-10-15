import { AppError, asyncHandler } from '../utils/http.js';
import { resolveSession, COOKIE_NAME } from '../utils/session.js';

export const requireAuth = asyncHandler(async (req, _res, next) => {
  // Bearer token first (works on every device/browser), cookie as a fallback.
  const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null;
  const token = bearer || req.cookies?.[COOKIE_NAME];
  if (!token) throw new AppError(401, 'Authentication required');
  const { user, roleSelected } = await resolveSession(token);
  req.user = user;
  req.roleSelected = roleSelected;
  next();
});

export const allowRoles = (...roles) => (req, _res, next) =>
  roles.includes(req.user?.role) ? next() : next(new AppError(403, 'You do not have permission to perform this action'));
