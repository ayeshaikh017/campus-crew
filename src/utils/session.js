import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { AppError } from './http.js';

export const COOKIE_NAME = process.env.COOKIE_NAME || 'campuscrew_token';

export const isStaffUser = (u) =>
  ['coordinator', 'admin'].includes(u?.role) || u?.isTeacher === true;

// role: 'volunteer' (student) | 'coordinator' (teacher) | 'admin'
export function signSession(user, { role, roleSelected = false } = {}) {
  return jwt.sign(
    { sub: user.id, ver: user.tokenVersion, role: role || user.role, rs: roleSelected ? 1 : 0 },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

// Verifies a token and returns the user with the *session* role applied in memory.
// The in-memory role is never saved: routes must not call req.user.save().
export async function resolveSession(token) {
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    throw new AppError(401, 'Invalid or expired session');
  }
  const user = await User.findById(payload.sub).select('+passwordHash');
  if (!user || user.tokenVersion !== payload.ver || user.accountStatus !== 'active' || !user.isEmailVerified) {
    throw new AppError(401, 'Session is no longer valid');
  }
  const dbRole = user.role;
  user.$locals.dbRole = dbRole;
  if (dbRole !== 'admin' && payload.role) {
    // A token can never grant more than the user is allowed to be.
    const mayTeach = dbRole === 'coordinator' || user.isTeacher === true;
    user.role = payload.role === 'coordinator' && mayTeach ? 'coordinator' : 'volunteer';
  }
  return { user, roleSelected: dbRole === 'admin' || payload.rs === 1 };
}
