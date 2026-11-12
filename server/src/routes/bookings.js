/** Player bookings (PRD §8 "Player"): book + pay, retry payment, status, list, cancel. */
import { Router } from 'express';
import { z } from 'zod';
import { Area } from '../models/Area.js';
import { Booking } from '../models/Booking.js';
import { Payment } from '../models/Payment.js';
import { getSettings } from '../models/Settings.js';
import { Venue } from '../models/Venue.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createBooking } from '../services/bookings.js';
import { notifier } from '../services/notifier.js';
import { refundPayment, startPayment } from '../services/payments/index.js';
import { visibleVenueFilter } from '../services/venues.js';
import { AppError, notFound } from '../utils/AppError.js';
import { hhmm, isoDate, objectId, senegalPhone, wallet } from '../utils/schemas.js';

const router = Router();
router.use(authenticate, requireRole('client'));

const VENUE_FIELDS = 'name address district city phone timezone';

const PAYMENT_FIELDS = 'bookingId kind method phone amount status failureReason redirectUrl createdAt';

/** What the player sees of bookings: no commission, plus each one's latest charge and refund. One payment query for the whole list. */
async function playerViews(bookings) {
  const payments = await Payment.find({ bookingId: { $in: bookings.map((b) => b._id) } })
    .sort({ createdAt: -1 }).select(PAYMENT_FIELDS).lean();
  return bookings.map((booking) => {
    const b = booking.toJSON();
    delete b.commission;
    delete b.commissionRate;
    delete b.ownerNet;
    delete b.idempotencyKey;
    const mine = payments.filter((p) => p.bookingId.equals(booking._id));
    return {
      ...b,
      payment: mine.find((p) => p.kind === 'charge') ?? null,
      refund: mine.find((p) => p.kind === 'refund') ?? null,
    };
  });
}

const playerView = async (booking) => (await playerViews([booking]))[0];

const createSchema = z.object({
  areaId: objectId,
  date: isoDate,
  start: hhmm,
  slotCount: z.number().int().min(1).max(48),
  method: wallet,
  phone: senegalPhone,
  note: z.string().trim().max(60).optional(),
});

router.post('/', validate(createSchema), async (req, res) => {
  const { areaId, date, start, slotCount, method, phone, note } = req.valid.body;
  const area = await Area.findOne({ _id: areaId, active: true });
  if (!area) throw notFound('Terrain');
  const venue = await Venue.findOne({ _id: area.venueId, ...visibleVenueFilter });
  if (!venue) throw notFound('Complexe');

  const idempotencyKey = req.get('Idempotency-Key')?.slice(0, 100);
  const booking = await createBooking({ venue, area, dateStr: date, start, slotCount, source: 'online', client: req.user, note, createdBy: req.user, idempotencyKey });
  // A repeated request with the same key returns the same booking and its existing payment.
  const existing = await Payment.findOne({ bookingId: booking._id, kind: 'charge' }).sort({ createdAt: -1 });
  const pay = existing ? { redirectUrl: existing.redirectUrl } : await startPayment({ booking, method, phone });
  res.status(existing ? 200 : 201).json({ booking: await playerView(booking), redirectUrl: pay.redirectUrl, instructions: pay.instructions });
});

async function ownBooking(req) {
  const booking = await Booking.findOne({ _id: req.params.id, clientId: req.user._id }).populate('venueId', VENUE_FIELDS);
  if (!booking) throw notFound('Réservation');
  return booking;
}

/** Retry after a failed payment, possibly with another wallet, while the hold lasts. */
router.post('/:id/pay', validate(z.object({ method: wallet, phone: senegalPhone })), async (req, res) => {
  const booking = await ownBooking(req);
  const pay = await startPayment({ booking, ...req.valid.body });
  res.status(201).json({ booking: await playerView(booking), redirectUrl: pay.redirectUrl, instructions: pay.instructions });
});

const listSchema = z.object({
  tab: z.enum(['upcoming', 'past', 'cancelled']).default('upcoming'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** Which bookings each "Mes réservations" tab shows. */
function tabFilter(tab, now) {
  if (tab === 'upcoming') return [{ status: 'confirmed', endAt: { $gte: now } }, { status: 'pending_payment', holdExpiresAt: { $gt: now } }];
  if (tab === 'past') return [{ status: 'confirmed', endAt: { $lt: now } }, { status: 'no_show' }];
  return [{ status: { $in: ['cancelled_by_client', 'cancelled_by_owner'] } }];
}

/** One page of a tab. Upcoming is soonest first, past and cancelled most recent first. `counts` holds every tab's total. */
router.get('/me', validate(listSchema, 'query'), async (req, res) => {
  const { tab, page, limit } = req.valid.query;
  const now = new Date();
  const clientId = req.user._id;
  const sort = tab === 'upcoming' ? { startAt: 1, _id: 1 } : { startAt: -1, _id: -1 };
  const tabs = ['upcoming', 'past', 'cancelled'];
  const [bookings, settings, totals] = await Promise.all([
    Booking.find({ clientId, $or: tabFilter(tab, now) }).sort(sort).skip((page - 1) * limit).limit(limit).populate('venueId', VENUE_FIELDS),
    getSettings(),
    Promise.all(tabs.map((t) => Booking.countDocuments({ clientId, $or: tabFilter(t, now) }))),
  ]);
  const counts = Object.fromEntries(tabs.map((t, i) => [t, totals[i]]));
  res.json({
    bookings: await playerViews(bookings),
    counts,
    page,
    limit,
    hasMore: page * limit < counts[tab],
    cancellationCutoffHours: settings.cancellationCutoffHours,
  });
});

router.get('/:id', async (req, res) => {
  res.json({ booking: await playerView(await ownBooking(req)) });
});

router.patch('/:id/cancel', async (req, res) => {
  const booking = await ownBooking(req);
  const { cancellationCutoffHours } = await getSettings();
  if (booking.status !== 'confirmed') throw new AppError(409, 'NOT_CANCELLABLE', 'Cette réservation ne peut plus être annulée');
  if (Date.now() > booking.startAt.getTime() - cancellationCutoffHours * 3600e3) {
    throw new AppError(409, 'CUTOFF_PASSED', `Annulation impossible à moins de ${cancellationCutoffHours} h du début`);
  }
  Object.assign(booking, { status: 'cancelled_by_client', cancelledAt: new Date() });
  await booking.save();
  const refund = await refundPayment(booking, null, 'Annulation par le joueur');
  notifier.bookingCancelled(booking._id, refund);
  res.json({ booking: await playerView(booking) });
});

export default router;
