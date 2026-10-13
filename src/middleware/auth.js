import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { AppError, asyncHandler } from '../utils/http.js';
export const requireAuth = asyncHandler(async (req, _res, next) => {
  const token = req.cookies?.[process.env.COOKIE_NAME || 'campuscrew_token'] || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
  if (!token) throw new AppError(401, 'Authentication required');
  let payload; try { payload = jwt.verify(token, process.env.JWT_SECRET); } catch { throw new AppError(401, 'Invalid or expired session'); }
  const user = await User.findById(payload.sub).select('+passwordHash');
  if (!user || user.tokenVersion !== payload.ver || user.accountStatus !== 'active' || !user.isEmailVerified) throw new AppError(401, 'Session is no longer valid');
  req.user = user; next();
});
export const allowRoles = (...roles) => (req, _res, next) => roles.includes(req.user?.role) ? next() : next(new AppError(403, 'You do not have permission to perform this action'));
