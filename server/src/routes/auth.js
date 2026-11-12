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
import { normalizeSenegalPhone } from '../utils/phone.js';
import { senegalPhone } from '../utils/schemas.js';

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
  phone: senegalPhone,
  email: z.string().trim().toLowerCase().email().optional().or(z.literal('').transform(() => undefined)),
  password: z.string().min(8).max(100),
  role: z.enum(['client', 'owner']),
});

router.post('/register', validate(registerSchema), async (req, res) => {
  const { password, ...data } = req.valid.body;
  if (await User.exists({ phone: data.phone })) throw new AppError(409, 'PHONE_TAKEN', 'Un compte existe déjà avec ce numéro');
  if (data.email && (await User.exists({ email: data.email }))) throw new AppError(409, 'EMAIL_TAKEN', 'Un compte existe déjà avec cet e-mail');
  const user = await User.create({ ...data, passwordHash: await bcrypt.hash(password, 12) });
  res.status(201).json(startSession(res, user));
});

// Log in with a phone number or an email (PRD FR-A2). `email` is still accepted for older clients.
const loginSchema = z
  .object({ identifier: z.string().trim().min(3).optional(), email: z.string().trim().optional(), password: z.string().min(1) })
  .refine((b) => b.identifier || b.email, { message: 'Téléphone ou e-mail requis' });

router.post('/login', validate(loginSchema), async (req, res) => {
  const { password } = req.valid.body;
  const id = req.valid.body.identifier ?? req.valid.body.email;
  const phone = normalizeSenegalPhone(id);
  const query = id.includes('@') ? { email: id.toLowerCase() } : phone ? { phone } : null;
  const user = query && (await User.findOne(query).select('+passwordHash +tokenVersion'));
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Identifiant ou mot de passe incorrect');
  }
  if (user.status !== 'active') throw new AppError(403, 'ACCOUNT_SUSPENDED', 'Ce compte est suspendu');
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
