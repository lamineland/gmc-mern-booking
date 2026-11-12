import { z } from 'zod';
import { DateTime } from 'luxon';
import { SPORTS } from '../domain/sizes.js';
import { normalizeSenegalPhone } from './phone.js';

export const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
export const hhmm = z.string().regex(/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/, 'Use HH:MM');
export const senegalPhone = z.string().transform((v, ctx) => {
  const phone = normalizeSenegalPhone(v);
  if (!phone) ctx.addIssue({ code: 'custom', message: 'Numéro sénégalais invalide (ex. 77 123 45 67)' });
  return phone;
});
export const wallet = z.enum(['wave', 'orange_money', 'free_money']);
const fcfa = z.number().int().min(0).max(10_000_000);

const interval = z
  .object({ open: hhmm, close: hhmm })
  .refine((i) => i.open < i.close, { message: 'Opening time must be before closing time' });

export const venueBody = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(2000).default(''),
  city: z.string().trim().min(2).max(80),
  district: z.string().trim().max(80).default(''),
  address: z.string().trim().min(3).max(200),
  phone: z.string().trim().max(30).optional(),
  whatsapp: z.string().trim().max(30).optional(),
  amenities: z.array(z.string().trim().max(40)).max(20).default([]),
  location: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).optional(),
  timezone: z.string().refine((tz) => DateTime.local().setZone(tz).isValid, 'Unknown timezone').optional(),
  openingHours: z.array(z.object({ day: z.number().int().min(0).max(6), intervals: z.array(interval).max(4) })).max(7).optional(),
  exceptions: z
    .array(z.object({ date: isoDate, closed: z.boolean().default(false), intervals: z.array(interval).max(4).default([]) }))
    .max(100)
    .optional(),
  paymentMode: z.enum(['full', 'deposit']).optional(),
  depositAmount: fcfa.optional(),
  payoutWallet: z.object({ method: wallet, phone: senegalPhone }).optional(),
});

export const priceRuleBody = z.object({
  days: z.array(z.number().int().min(0).max(6)),
  from: hhmm,
  to: hhmm,
  price: fcfa,
});
export const priceListBody = z.object({ basePrice: fcfa, priceRules: z.array(priceRuleBody).max(20).default([]) });

export const areaBody = z.object({
  name: z.string().trim().min(1).max(100),
  sport: z.enum(SPORTS),
  format: z.string().trim().max(50).default(''),
  surface: z.string().trim().max(50).default(''),
  indoor: z.boolean().default(false),
  lit: z.boolean().default(true),
  maxPlayers: z.number().int().min(1).max(50).default(10),
  lengthM: z.number().min(5).max(150),
  widthM: z.number().min(5).max(100),
  slotMinutes: z.union([z.literal(15), z.literal(30), z.literal(60)]).default(30),
  minSlots: z.number().int().min(1).max(24).default(1),
  maxSlots: z.number().int().min(1).max(48).default(6),
  bookingHorizonDays: z.number().int().min(1).max(365).default(30),
  active: z.boolean().optional(),
});

export const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(12),
};
