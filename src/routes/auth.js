import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

import User from '../models/User.js';
import Otp from '../models/Otp.js';
import { asyncHandler, ok, AppError } from '../utils/http.js';
import { makeOtp, hashText, safeCompare } from '../utils/otp.js';
import { sendOtp } from '../utils/mailer.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { signSession, COOKIE_NAME } from '../utils/session.js';

const router = Router();

const emailSchema = z
  .string()
  .email()
  .max(180)
  .transform((v) => v.toLowerCase());

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  collegeId: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .transform((v) => v.toUpperCase()),
  collegeEmail: emailSchema,
  password: z.string().min(8).max(72),
  department: z.string().max(100).optional(),
  academicYear: z.string().max(30).optional(),
});

const otpSchema = z.object({
  email: emailSchema,
  otp: z.string().regex(/^\d{6}$/),
});

// ---------------------------------------------------------------------------
// Cookies
// Frontend and backend are on different sites in production (two onrender.com
// subdomains), so the cookie must be SameSite=None + Secure there.
// Locally both run on "localhost", so SameSite=Lax works fine.
// ---------------------------------------------------------------------------
const isProd = process.env.NODE_ENV === 'production';

const baseCookieOptions = () => ({
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'none' : 'lax',
  path: '/',
});

const cookieOptions = () => ({
  ...baseCookieOptions(),
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

function setSession(res, user, opts) {
  const token = signSession(user, opts);
  res.cookie(COOKIE_NAME, token, cookieOptions());
  return token;
}

const publicUser = (user, extra = {}) => ({
  ...user.toJSON(),
  roleSelected: false,
  ...extra,
});

// ---------------------------------------------------------------------------
// OTP helper
// ---------------------------------------------------------------------------
async function issueOtp(email, purpose) {
  const now = Date.now();
  let record = await Otp.findOne({ email, purpose, consumedAt: null }).sort({
    createdAt: -1,
  });

  const cooldown = Number(process.env.OTP_RESEND_SECONDS || 30) * 1000;
  if (
    record &&
    now - new Date(record.lastSentAt || record.createdAt).getTime() < cooldown
  ) {
    throw new AppError(429, 'Please wait before requesting another code');
  }

  const otp = makeOtp();
  const expiresAt = new Date(
    now + Number(process.env.OTP_EXPIRES_MINUTES || 5) * 60000
  );

  if (record) {
    record.otpHash = hashText(otp);
    record.expiresAt = expiresAt;
    record.attempts = 0;
    record.lastSentAt = new Date();
    await record.save();
  } else {
    record = await Otp.create({
      email,
      purpose,
      otpHash: hashText(otp),
      expiresAt,
      lastSentAt: new Date(),
    });
  }

  await sendOtp(email, otp, purpose);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
router.post(
  '/register',
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const {
      name,
      collegeId,
      collegeEmail,
      password,
      department = '',
      academicYear = '',
    } = req.body;

    if (await User.exists({ $or: [{ collegeId }, { collegeEmail }] })) {
      throw new AppError(409, 'College ID or email is already registered');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    // No OTP step: the account is active immediately and the user is logged in.
    const user = await User.create({
      name,
      collegeId,
      collegeEmail,
      passwordHash,
      department,
      academicYear,
      isEmailVerified: true,
      accountStatus: 'active',
    });

    const token = setSession(res, user, { role: user.role, roleSelected: false });
    ok(res, { user: publicUser(user), token }, 'Account created', 201);
  })
);

router.post(
  '/verify-email',
  validate(otpSchema),
  asyncHandler(async (req, res) => {
    const email = req.body.email;

    const record = await Otp.findOne({
      email,
      purpose: 'register',
      consumedAt: null,
    }).sort({ createdAt: -1 });

    if (!record || record.expiresAt < new Date() || record.attempts >= 5) {
      throw new AppError(400, 'Code expired or invalid. Request a new code');
    }

    if (!safeCompare(record.otpHash, hashText(req.body.otp))) {
      record.attempts++;
      await record.save();
      throw new AppError(400, 'Invalid verification code');
    }

    record.consumedAt = new Date();
    await record.save();

    const user = await User.findOneAndUpdate(
      { collegeEmail: email },
      { isEmailVerified: true, accountStatus: 'active' },
      { new: true }
    );
    if (!user) throw new AppError(404, 'Account not found');

    const token = setSession(res, user, { role: user.role, roleSelected: false });
    ok(res, { user: publicUser(user), token }, 'Email verified');
  })
);

router.post(
  '/resend-verification',
  asyncHandler(async (req, res) => {
    const email = emailSchema.parse(req.body.email);
    const user = await User.findOne({ collegeEmail: email });

    if (!user || user.isEmailVerified) {
      return ok(res, null, 'If verification is needed, a code will be sent');
    }

    await issueOtp(email, 'register');
    ok(res, null, 'If verification is needed, a code will be sent');
  })
);

router.post(
  '/login',
  validate(
    z.object({
      email: emailSchema,
      password: z.string().min(1).max(72),
    })
  ),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({
      collegeEmail: req.body.email,
    }).select('+passwordHash');

    if (!user || !(await bcrypt.compare(req.body.password, user.passwordHash))) {
      throw new AppError(401, 'Invalid email or password');
    }

    if (!user.isEmailVerified && user.accountStatus === 'pending') {
      user.isEmailVerified = true;
      user.accountStatus = 'active';
      await user.save();
    }

    if (!user.isEmailVerified || user.accountStatus !== 'active') {
      throw new AppError(
        403,
        'Verify your college email first'
      );
    }

    // roleSelected is false on every fresh login, so the student/teacher chooser shows.
    const token = setSession(res, user, { role: user.role, roleSelected: false });
    ok(res, { user: publicUser(user), token }, 'Login successful');
  })
);

router.post(
  '/logout',
  asyncHandler(async (_req, res) => {
    // Tokens live on the device; logging out here only clears this device's session.
    // (Bumping tokenVersion would sign the user out of every other device too.)
    res.clearCookie(COOKIE_NAME, baseCookieOptions());
    ok(res, null, 'Logged out');
  })
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) =>
    ok(res, { user: { ...req.user.toJSON(), roleSelected: req.roleSelected } })
  )
);

// Choose how to use the app for this login: student or teacher.
// Teacher needs TEACHER_ACCESS_CODE (first time only), otherwise any student could
// pick "teacher" and see every volunteer and write tasks for them.
router.post(
  '/select-role',
  requireAuth,
  validate(z.object({ role: z.enum(['student', 'teacher']), accessCode: z.string().max(100).optional() })),
  asyncHandler(async (req, res) => {
    const user = req.user;
    const dbRole = user.$locals.dbRole;
    let role = 'volunteer';
    if (req.body.role === 'teacher') {
      const alreadyTeacher = dbRole === 'coordinator' || dbRole === 'admin' || user.isTeacher === true;
      if (!alreadyTeacher) {
        const expected = process.env.TEACHER_ACCESS_CODE;
        if (!expected) {
          if (isProd) throw new AppError(403, 'Teacher sign-in is not configured yet. Set TEACHER_ACCESS_CODE on the server.');
        } else if (!safeCompare(hashText(req.body.accessCode || ''), hashText(expected))) {
          throw new AppError(403, 'Incorrect teacher access code');
        }
        await User.updateOne({ _id: user.id }, { $set: { isTeacher: true } });
        user.isTeacher = true;
      }
      role = 'coordinator';
    }
    const token = setSession(res, user, { role, roleSelected: true });
    ok(res, { user: publicUser(user, { role, roleSelected: true }), token }, 'Role selected');
  })
);

router.post(
  '/forgot-password',
  asyncHandler(async (req, res) => {
    const email = emailSchema.parse(req.body.email);
    const user = await User.findOne({ collegeEmail: email });

    if (user) await issueOtp(email, 'reset_password');
    ok(res, null, 'If an account exists, a reset code will be sent');
  })
);

router.post(
  '/verify-reset-otp',
  validate(otpSchema),
  asyncHandler(async (req, res) => {
    const record = await Otp.findOne({
      email: req.body.email,
      purpose: 'reset_password',
      consumedAt: null,
    }).sort({ createdAt: -1 });

    if (!record || record.expiresAt < new Date() || record.attempts >= 5) {
      throw new AppError(400, 'Code expired or invalid');
    }

    if (!safeCompare(record.otpHash, hashText(req.body.otp))) {
      record.attempts++;
      await record.save();
      throw new AppError(400, 'Invalid verification code');
    }

    const grant = makeOtp() + makeOtp();
    record.consumedAt = new Date();
    record.grantHash = hashText(grant);
    record.grantExpiresAt = new Date(Date.now() + 10 * 60000);
    record.grantUsedAt = null;
    await record.save();

    ok(
      res,
      { resetGrant: grant },
      'Code verified. Use the reset grant once within 10 minutes'
    );
  })
);

router.post(
  '/reset-password',
  validate(
    z.object({
      email: emailSchema,
      resetGrant: z.string().min(12).max(100),
      newPassword: z.string().min(8).max(72),
    })
  ),
  asyncHandler(async (req, res) => {
    const record = await Otp.findOne({
      email: req.body.email,
      purpose: 'reset_password',
      grantUsedAt: null,
    }).sort({ createdAt: -1 });

    if (
      !record ||
      !record.grantHash ||
      record.grantExpiresAt < new Date() ||
      !safeCompare(record.grantHash, hashText(req.body.resetGrant))
    ) {
      throw new AppError(400, 'Invalid or expired reset grant');
    }

    record.grantUsedAt = new Date();
    await record.save();

    const user = await User.findOne({ collegeEmail: req.body.email });
    if (!user) throw new AppError(400, 'Invalid reset request');

    user.passwordHash = await bcrypt.hash(req.body.newPassword, 12);
    user.tokenVersion++;
    await user.save();

    ok(res, null, 'Password reset successful. Please log in again');
  })
);

export default router;