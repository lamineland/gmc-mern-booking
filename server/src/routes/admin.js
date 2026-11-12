/** Admin routes (PRD v2.2 §4.4, §8 "Admin"). */
import { Router } from 'express';
import { z } from 'zod';
import { Area } from '../models/Area.js';
import { Booking } from '../models/Booking.js';
import { LedgerEntry } from '../models/LedgerEntry.js';
import { Payment } from '../models/Payment.js';
import { Payout } from '../models/Payout.js';
import { Settings, getSettings, invalidateSettings } from '../models/Settings.js';
import { User } from '../models/User.js';
import { Venue } from '../models/Venue.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { notifier } from '../services/notifier.js';
import { retryRefund } from '../services/payments/index.js';
import { deriveSize } from '../services/venues.js';
import { AppError, notFound } from '../utils/AppError.js';
import { isoDate, objectId, pagination } from '../utils/schemas.js';

const router = Router();
router.use(authenticate, requireRole('admin'));

// ---- Venues --------------------------------------------------------------------------

const venueQuery = z.object({ status: z.enum(['pending', 'approved', 'rejected']).default('pending'), ...pagination });

router.get('/venues', validate(venueQuery, 'query'), async (req, res) => {
  const { status, page, limit } = req.valid.query;
  const [venues, total] = await Promise.all([
    Venue.find({ status }).sort({ updatedAt: 1 }).skip((page - 1) * limit).limit(limit).populate('ownerId', 'name email phone status'),
    Venue.countDocuments({ status }),
  ]);
  const areas = await Area.find({ venueId: { $in: venues.map((v) => v._id) }, active: true });
  const items = venues.map((v) => ({ ...v.toJSON(), areas: areas.filter((a) => a.venueId.equals(v._id)) }));
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
});

router.patch('/venues/:id/approve', async (req, res) => {
  const venue = await Venue.findByIdAndUpdate(req.params.id, { status: 'approved', $unset: { rejectionReason: 1 } }, { new: true });
  if (!venue) throw notFound('Complexe');
  notifier.venueReviewed(venue._id);
  res.json({ venue });
});

router.patch('/venues/:id/reject', validate(z.object({ reason: z.string().trim().min(3, 'Indique une raison').max(500) })), async (req, res) => {
  const venue = await Venue.findByIdAndUpdate(req.params.id, { status: 'rejected', rejectionReason: req.valid.body.reason }, { new: true });
  if (!venue) throw notFound('Complexe');
  notifier.venueReviewed(venue._id);
  res.json({ venue });
});

/** Per-venue commission override (null = platform default). New bookings only (PRD AD4). */
router.patch('/venues/:id/commission', validate(z.object({ commissionRate: z.number().min(0).max(0.5).nullable() })), async (req, res) => {
  const { commissionRate } = req.valid.body;
  const venue = await Venue.findByIdAndUpdate(req.params.id, commissionRate == null ? { $unset: { commissionRate: 1 } } : { commissionRate }, { new: true });
  if (!venue) throw notFound('Complexe');
  res.json({ venue });
});

// ---- Settings ------------------------------------------------------------------------

const sizeCat = z.object({ key: z.string().min(1).max(20), label: z.string().min(1).max(40), maxM2: z.number().positive().nullable() });
const settingsSchema = z
  .object({
    commissionRate: z.number().min(0).max(0.5),
    commissionMin: z.number().int().min(0).nullable(),
    commissionMax: z.number().int().min(0).nullable(),
    cancellationCutoffHours: z.number().min(0).max(72),
    holdMinutes: z.number().int().min(2).max(30),
    sizeCategories: z.record(z.array(sizeCat).min(1)),
  })
  .partial();

router.get('/settings', async (req, res) => res.json({ settings: await getSettings() }));

router.put('/settings', validate(settingsSchema), async (req, res) => {
  const body = req.valid.body;
  if (body.commissionMin != null && body.commissionMax != null && body.commissionMin > body.commissionMax) {
    throw new AppError(400, 'INVALID_RANGE', 'La commission minimum dépasse le maximum');
  }
  for (const [sport, list] of Object.entries(body.sizeCategories ?? {})) {
    if (list[list.length - 1].maxM2 !== null) throw new AppError(400, 'INVALID_SIZES', `${sport} : la dernière taille ne doit pas avoir de limite`);
  }
  const unset = Object.fromEntries(Object.entries(body).filter(([, v]) => v === null).map(([k]) => [k, 1]));
  const set = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== null));
  await Settings.updateOne({ _id: 'platform' }, { $set: { ...set, updatedBy: req.user._id }, ...(Object.keys(unset).length ? { $unset: unset } : {}) }, { upsert: true });
  invalidateSettings();
  // New size limits apply to existing areas right away.
  if (body.sizeCategories) for (const area of await Area.find()) await (await deriveSize(area)).save();
  res.json({ settings: await getSettings() });
});

// ---- Payments & refunds (PRD AD5) --------------------------------------------------------

const paymentQuery = z.object({
  status: z.enum(['pending', 'succeeded', 'failed', 'expired', 'refund_failed']).optional(),
  kind: z.enum(['charge', 'refund']).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  ...pagination,
});

router.get('/payments', validate(paymentQuery, 'query'), async (req, res) => {
  const { status, kind, from, to, page, limit } = req.valid.query;
  const filter = {};
  if (status) filter.status = status;
  if (kind) filter.kind = kind;
  if (from || to) filter.createdAt = { ...(from ? { $gte: new Date(from) } : {}), ...(to ? { $lt: new Date(`${to}T23:59:59.999Z`) } : {}) };
  const [items, total] = await Promise.all([
    Payment.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)
      .select('-events.raw').populate('bookingId', 'code startAt').populate('venueId', 'name'),
    Payment.countDocuments(filter),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
});

router.post('/payments/:id/retry-refund', async (req, res) => {
  res.json({ refund: await retryRefund(req.params.id) });
});

// ---- Payouts (PRD AD6) ---------------------------------------------------------------

router.get('/payouts/balances', async (req, res) => {
  const rows = await LedgerEntry.aggregate([{ $group: { _id: '$venueId', balance: { $sum: '$amount' } } }]);
  const venues = await Venue.find({ _id: { $in: rows.map((r) => r._id) } }).select('name payoutWallet ownerId').populate('ownerId', 'name phone');
  const lastPayouts = await Payout.aggregate([{ $sort: { paidAt: -1 } }, { $group: { _id: '$venueId', paidAt: { $first: '$paidAt' } } }]);
  res.json({
    items: rows
      .map((r) => ({ venue: venues.find((v) => v._id.equals(r._id)), balance: r.balance, lastPayoutAt: lastPayouts.find((p) => p._id.equals(r._id))?.paidAt ?? null }))
      .filter((r) => r.venue)
      .sort((a, b) => b.balance - a.balance),
  });
});

const payoutSchema = z.object({
  venueId: objectId,
  amount: z.number().int().min(1),
  method: z.string().trim().min(2).max(40),
  reference: z.string().trim().max(80).default(''),
  paidAt: isoDate,
  note: z.string().trim().max(300).optional(),
});

router.post('/payouts', validate(payoutSchema), async (req, res) => {
  const { venueId, paidAt, ...data } = req.valid.body;
  if (!(await Venue.exists({ _id: venueId }))) throw notFound('Complexe');
  const payout = await Payout.create({ ...data, venueId, paidAt: new Date(paidAt), recordedBy: req.user._id });
  await LedgerEntry.create({ venueId, payoutId: payout._id, type: 'payout', amount: -payout.amount });
  notifier.payoutRecorded(payout);
  res.status(201).json({ payout });
});

// ---- Users -------------------------------------------------------------------------------

const userQuery = z.object({
  role: z.enum(['client', 'owner', 'admin']).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  q: z.string().trim().max(100).optional(),
  ...pagination,
});

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.get('/users', validate(userQuery, 'query'), async (req, res) => {
  const { role, status, q, page, limit } = req.valid.query;
  const filter = {};
  if (role) filter.role = role;
  if (status) filter.status = status;
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { phone: new RegExp(escapeRegex(q.replace(/\s/g, ''))) }];
  }
  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    User.countDocuments(filter),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
});

async function targetUser(req) {
  const user = await User.findById(req.params.id);
  if (!user) throw notFound('Utilisateur');
  if (user.role === 'admin') throw new AppError(403, 'FORBIDDEN', 'Les admins ne se gèrent pas ici');
  return user;
}

router.patch('/users/:id/suspend', async (req, res) => {
  const user = await targetUser(req);
  await User.updateOne({ _id: user._id }, { status: 'suspended', $inc: { tokenVersion: 1 } });
  let upcomingBookingsAffected = 0;
  if (user.role === 'owner') {
    const venues = await Venue.find({ ownerId: user._id }).select('_id');
    await Venue.updateMany({ ownerId: user._id }, { ownerSuspended: true });
    upcomingBookingsAffected = await Booking.countDocuments({ venueId: { $in: venues.map((v) => v._id) }, status: 'confirmed', startAt: { $gt: new Date() } });
  }
  res.json({ user: { ...user.toJSON(), status: 'suspended' }, upcomingBookingsAffected });
});

router.patch('/users/:id/reactivate', async (req, res) => {
  const user = await targetUser(req);
  user.status = 'active';
  await user.save();
  if (user.role === 'owner') await Venue.updateMany({ ownerId: user._id }, { ownerSuspended: false });
  res.json({ user });
});

router.delete('/users/:id', async (req, res) => {
  const user = await targetUser(req);
  if (user.role === 'owner' && (await Venue.exists({ ownerId: user._id }))) {
    throw new AppError(409, 'HAS_VENUES', 'Ce propriétaire a des complexes. Suspends le compte à la place.');
  }
  if (await Booking.exists({ clientId: user._id, status: 'confirmed', startAt: { $gt: new Date() } })) {
    throw new AppError(409, 'HAS_UPCOMING_BOOKINGS', 'Ce joueur a des réservations à venir. Suspends le compte à la place.');
  }
  await user.deleteOne();
  res.status(204).end();
});

// ---- Stats (PRD AD7) ---------------------------------------------------------------------

router.get('/stats', async (req, res) => {
  const [users, venues, pendingVenues, bookings, money] = await Promise.all([
    User.countDocuments(),
    Venue.countDocuments(),
    Venue.countDocuments({ status: 'pending' }),
    Booking.aggregate([
      { $match: { status: { $in: ['confirmed', 'no_show'] } } },
      { $group: { _id: null, count: { $sum: 1 }, minutes: { $sum: { $divide: [{ $subtract: ['$endAt', '$startAt'] }, 60000] } }, gross: { $sum: '$price' } } },
    ]),
    LedgerEntry.aggregate([{ $match: { type: { $in: ['commission', 'commission_reversal'] } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
  ]);
  res.json({
    users, venues, pendingVenues,
    bookings: bookings[0]?.count ?? 0,
    bookedHours: Math.round((bookings[0]?.minutes ?? 0) / 60),
    grossBookingValue: bookings[0]?.gross ?? 0,
    commissionEarned: -(money[0]?.total ?? 0),
  });
});

export default router;
