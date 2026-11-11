import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { User } from '../models/User.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { AppError } from '../utils/AppError.js';

const router = Router();
router.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: 'draft-7', legacyHeaders: false }));

const REFRESH_COOKIE = 'refreshToken';
const cookieOptions = {
  httpOnly: true,
  secure: config.isProd,
  sameSite: 'lax',
  path: '/api/v1/auth',
  maxAge: config.refreshTokenTtlDays * 24 * 3600 * 1000,
};

const signAccess = (user) => jwt.sign({ sub: user.id, role: user.role }, config.jwtAccessSecret, { expiresIn: config.accessTokenTtl });
const signRefresh = (user) =>
  jwt.sign({ sub: user.id, v: user.tokenVersion }, config.jwtRefreshSecret, { expiresIn: `${config.refreshTokenTtlDays}d` });

function startSession(res, user) {
  res.cookie(REFRESH_COOKIE, signRefresh(user), cookieOptions);
  return { user, accessToken: signAccess(user) };
}

const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(100),
  phone: z.string().trim().max(30).optional(),
  role: z.enum(['client', 'owner']),
});

router.post('/register', validate(registerSchema), async (req, res) => {
  const { password, ...data } = req.valid.body;
  if (await User.exists({ email: data.email })) throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
  const user = await User.create({ ...data, passwordHash: await bcrypt.hash(password, 12) });
  res.status(201).json(startSession(res, user));
});

const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });

router.post('/login', validate(loginSchema), async (req, res) => {
  const { email, password } = req.valid.body;
  const user = await User.findOne({ email }).select('+passwordHash +tokenVersion');
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Wrong email or password');
  }
  if (user.status !== 'active') throw new AppError(403, 'ACCOUNT_SUSPENDED', 'This account is suspended');
  res.json(startSession(res, user));
});

router.post('/refresh', async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw new AppError(401, 'NO_SESSION', 'Please log in');
  let payload;
  try {
    payload = jwt.verify(token, config.jwtRefreshSecret);
  } catch {
    throw new AppError(401, 'NO_SESSION', 'Please log in');
  }
  const user = await User.findById(payload.sub).select('+tokenVersion');
  if (!user || user.status !== 'active' || user.tokenVersion !== payload.v) {
    res.clearCookie(REFRESH_COOKIE, { ...cookieOptions, maxAge: undefined });
    throw new AppError(401, 'NO_SESSION', 'Please log in');
  }
  res.json(startSession(res, user));
});

router.post('/logout', async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token) {
    try {
      const { sub } = jwt.verify(token, config.jwtRefreshSecret);
      await User.updateOne({ _id: sub }, { $inc: { tokenVersion: 1 } });
    } catch {
      /* already invalid */
    }
  }
  res.clearCookie(REFRESH_COOKIE, { ...cookieOptions, maxAge: undefined });
  res.status(204).end();
});

router.get('/me', authenticate, (req, res) => res.json({ user: req.user }));

export default router;
