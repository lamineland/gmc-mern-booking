import { ZodError } from 'zod';
import multer from 'multer';
import { AppError } from '../utils/AppError.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const send = (status, code, message, details) =>
    res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } });

  if (err instanceof AppError) return send(err.status, err.code, err.message, err.details);
  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    return send(400, 'VALIDATION_ERROR', details[0]?.message || 'Invalid input', details);
  }
  if (err instanceof multer.MulterError) return send(400, 'UPLOAD_ERROR', err.message);
  if (err.name === 'CastError') return send(400, 'INVALID_ID', 'Invalid id');
  if (err.code === 11000) return send(409, 'DUPLICATE', 'This value is already in use');
  if (err.type === 'entity.parse.failed') return send(400, 'INVALID_JSON', 'Malformed JSON body');

  console.error(err);
  return send(500, 'INTERNAL_ERROR', 'Something went wrong');
}
