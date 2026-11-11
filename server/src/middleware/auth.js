import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';

export async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new AppError(401, 'UNAUTHENTICATED', 'Please log in');

  let payload;
  try {
    payload = jwt.verify(header.slice(7), config.jwtAccessSecret);
  } catch {
    throw new AppError(401, 'TOKEN_INVALID', 'Your session has expired');
  }

  const user = await User.findById(payload.sub);
  if (!user || user.status !== 'active') {
    throw new AppError(401, 'UNAUTHENTICATED', 'This account is not available');
  }
  req.user = user;
  next();
}

export const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) throw new AppError(403, 'FORBIDDEN', 'You are not allowed to do this');
  next();
};
