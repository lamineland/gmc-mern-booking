import { z } from 'zod';
import { DateTime } from 'luxon';
import { CATEGORIES } from '../config.js';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');
const interval = z
  .object({ open: hhmm, close: hhmm })
  .refine((i) => i.open < i.close, { message: 'Opening time must be before closing time' });

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const businessBody = z.object({
  name: z.string().trim().min(2).max(100),
  category: z.enum(CATEGORIES),
  description: z.string().trim().max(2000).default(''),
  city: z.string().trim().min(2).max(80),
  address: z.string().trim().min(3).max(200),
  phone: z.string().trim().max(30).optional(),
  timezone: z
    .string()
    .refine((tz) => DateTime.local().setZone(tz).isValid, 'Unknown timezone')
    .optional(),
  slotStepMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]).optional(),
  openingHours: z
    .array(z.object({ day: z.number().int().min(0).max(6), intervals: z.array(interval).max(4) }))
    .max(7)
    .optional(),
  exceptions: z
    .array(
      z.object({
        date: isoDate,
        closed: z.boolean().default(false),
        intervals: z.array(interval).max(4).default([]),
      }),
    )
    .max(100)
    .optional(),
});

export const serviceBody = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).default(''),
  durationMin: z.number().int().min(5).max(720),
  price: z.number().min(0),
  usesRentalArea: z.boolean().default(false),
  active: z.boolean().optional(),
});

export const areaBody = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.string().trim().max(50).default(''),
  capacity: z.number().int().min(1).max(1000).default(1),
  active: z.boolean().optional(),
});

export const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
};
