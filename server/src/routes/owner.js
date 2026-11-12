/** Owner routes (PRD v2.2 §4.3, §8 "Owner"). Every route is scoped to the owner's own venues. */
import { Router } from 'express';
import multer from 'multer';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { config } from '../config.js';
import { Area } from '../models/Area.js';
import { Booking } from '../models/Booking.js';
import { LedgerEntry } from '../models/LedgerEntry.js';
import { Payment } from '../models/Payment.js';
import { Payout } from '../models/Payout.js';
import { getSettings } from '../models/Settings.js';
import { TimeBlock } from '../models/TimeBlock.js';
import { User } from '../models/User.js';
import { Venue } from '../models/Venue.js';
import { priceListErrors, priceListFor, sizeOrderWarnings } from '../domain/pricing.js';
import { sizeCategoryOf, sizeLabel } from '../domain/sizes.js';
import { atMinute, dayStart, fmtMin, localParts, openingIntervals, toMin } from '../domain/time.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { occupyingFilter } from '../services/availability.js';
import { createBooking } from '../services/bookings.js';
import { notifier } from '../services/notifier.js';
import { refundPayment } from '../services/payments/index.js';
import { storage } from '../services/storage.js';
import { areaView, deriveSize, syncVenueSports } from '../services/venues.js';
import { AppError, notFound } from '../utils/AppError.js';
import { formatPhone } from '../utils/phone.js';
import { areaBody, hhmm, isoDate, objectId, priceListBody, senegalPhone, venueBody } from '../utils/schemas.js';

const router = Router();
router.use(authenticate, requireRole('owner'));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxImageBytes, files: 1 },
  fileFilter: (req, file, cb) =>
    ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)
      ? cb(null, true)
      : cb(new AppError(400, 'INVALID_FILE_TYPE', 'Images JPEG, PNG ou WebP uniquement')),
});

async function ownVenue(req, id = req.params.venueId) {
  const venue = await Venue.findOne({ _id: id, ownerId: req.user._id });
  if (!venue) throw notFound('Complexe');
  return venue;
}
async function ownArea(req) {
  const area = await Area.findById(req.params.areaId);
  if (!area) throw notFound('Terrain');
  return { area, venue: await ownVenue(req, area.venueId) };
}
async function ownBooking(req) {
  const booking = await Booking.findById(req.params.id);
  if (!booking) throw notFound('Réservation');
  return { booking, venue: await ownVenue(req, booking.venueId) };
}

const toLocation = (l) => (l ? { type: 'Point', coordinates: [l.lng, l.lat] } : undefined);

// ---- Venues --------------------------------------------------------------------------

router.get('/venues', async (req, res) => {
  const venues = await Venue.find({ ownerId: req.user._id }).sort({ createdAt: 1 });
  res.json({ venues });
});

router.post('/venues', validate(venueBody), async (req, res) => {
  const { location, ...data } = req.valid.body;
  const venue = await Venue.create({ ...data, location: toLocation(location), ownerId: req.user._id, status: 'pending' });
  res.status(201).json({ venue });
});

router.get('/venues/:venueId', async (req, res) => {
  const venue = await ownVenue(req);
  const [areas, settings] = await Promise.all([Area.find({ venueId: venue._id }).sort({ createdAt: 1, _id: 1 }), getSettings()]);
  res.json({ venue, areas: areas.map((a) => areaView(venue, a, settings.sizeCategories)), sizeCategories: settings.sizeCategories });
});

const REVIEWED_FIELDS = ['name', 'city'];

router.put('/venues/:venueId', validate(venueBody.partial()), async (req, res) => {
  const venue = await ownVenue(req);
  const { location, ...changes } = req.valid.body;
  const needsReview = REVIEWED_FIELDS.some((f) => changes[f] !== undefined && changes[f] !== venue[f]);
  venue.set(changes);
  if (location) venue.location = toLocation(location);
  // Key changes on an approved venue go back to review; a rejected venue goes back on any edit (PRD O15).
  if ((venue.status === 'approved' && needsReview) || venue.status === 'rejected') {
    venue.status = 'pending';
    venue.rejectionReason = undefined;
  }
  await venue.save();
  res.json({ venue });
});

router.post('/venues/:venueId/photos', upload.single('photo'), async (req, res) => {
  const venue = await ownVenue(req);
  if (!req.file) throw new AppError(400, 'NO_FILE', 'Envoie une image dans le champ "photo"');
  if (venue.photoIds.length >= config.maxPhotosPerVenue) throw new AppError(400, 'TOO_MANY_PHOTOS', `${config.maxPhotosPerVenue} photos maximum`);
  const imageId = await storage.save({ buffer: req.file.buffer, contentType: req.file.mimetype, ownerId: req.user._id });
  venue.photoIds.push(imageId);
  await venue.save();
  res.status(201).json({ imageId, photoIds: venue.photoIds });
});

router.delete('/venues/:venueId/photos/:imageId', async (req, res) => {
  const venue = await ownVenue(req);
  const before = venue.photoIds.length;
  venue.photoIds = venue.photoIds.filter((id) => !id.equals(req.params.imageId));
  if (venue.photoIds.length === before) throw notFound('Photo');
  await venue.save();
  await storage.remove(req.params.imageId);
  res.status(204).end();
});

// ---- Areas ---------------------------------------------------------------------------

const checkLengths = (a) => {
  if (a.minSlots > a.maxSlots) throw new AppError(400, 'INVALID_LENGTH', 'La durée minimum dépasse la durée maximum');
};

router.post('/venues/:venueId/areas', validate(areaBody), async (req, res) => {
  const venue = await ownVenue(req);
  checkLengths(req.valid.body);
  const area = await deriveSize(new Area({ ...req.valid.body, venueId: venue._id }));
  await area.save();
  await syncVenueSports(venue._id);
  const settings = await getSettings();
  res.status(201).json({ area: areaView(venue, area, settings.sizeCategories), missingPrice: !priceListFor(venue, area) });
});

router.put('/areas/:areaId', validate(areaBody.partial()), async (req, res) => {
  const { area, venue } = await ownArea(req);
  area.set(req.valid.body);
  checkLengths(area);
  await deriveSize(area);
  await area.save();
  await syncVenueSports(venue._id);
  const settings = await getSettings();
  res.json({ area: areaView(venue, area, settings.sizeCategories), missingPrice: !priceListFor(venue, area) });
});

// Soft delete: past bookings keep their snapshot.
router.delete('/areas/:areaId', async (req, res) => {
  const { area, venue } = await ownArea(req);
  area.active = false;
  await area.save();
  await syncVenueSports(venue._id);
  res.status(204).end();
});

// ---- Pricing per size (PRD O5) ---------------------------------------------------------

const pricingSchema = z.object({
  pricing: z.array(z.object({ sport: z.string(), size: z.string() }).merge(priceListBody)).max(30),
  areas: z.array(z.object({ id: objectId, lengthM: z.number().min(5).max(150), widthM: z.number().min(5).max(100), pricing: priceListBody.nullable() })).max(50),
});

/** Saves size price lists, area dimensions and overrides in one go; returns warnings. */
router.put('/venues/:venueId/pricing', validate(pricingSchema), async (req, res) => {
  const venue = await ownVenue(req);
  const { sizeCategories } = await getSettings();
  const areas = await Area.find({ venueId: venue._id, active: true });
  const { pricing, areas: edits } = req.valid.body;

  const errors = [];
  const label = (p) => `${p.sport} · ${sizeLabel(p.sport, p.size, sizeCategories)}`;
  for (const p of pricing) errors.push(...priceListErrors(p, label(p)));
  const planned = areas.map((a) => {
    const e = edits.find((x) => x.id === a.id);
    const next = e ? { lengthM: e.lengthM, widthM: e.widthM, pricing: e.pricing } : { lengthM: a.lengthM, widthM: a.widthM, pricing: a.pricing?.basePrice != null ? a.pricing : null };
    const size = sizeCategoryOf(a.sport, next.lengthM, next.widthM, sizeCategories);
    if (next.pricing) errors.push(...priceListErrors(next.pricing, `${a.name} (tarif personnalisé)`));
    else if (!pricing.some((p) => p.sport === a.sport && p.size === size)) {
      errors.push(`${a.name} est maintenant « ${sizeLabel(a.sport, size, sizeCategories)} » : crée la grille de prix de cette taille.`);
    }
    return { area: a, next, size };
  });
  if (errors.length) throw new AppError(422, 'INVALID_PRICING', errors[0], errors);

  // Keep only lists an area uses, so the venue page lists real prices.
  const used = new Set(planned.filter((p) => !p.next.pricing).map((p) => `${p.area.sport}|${p.size}`));
  venue.pricing = pricing.filter((p) => used.has(`${p.sport}|${p.size}`));
  await venue.save();
  for (const { area, next, size } of planned) {
    Object.assign(area, { lengthM: next.lengthM, widthM: next.widthM, sizeCategory: size });
    area.pricing = next.pricing ?? undefined;
    await area.save();
  }
  res.json({
    venue,
    areas: planned.map(({ area }) => areaView(venue, area, sizeCategories)),
    warnings: sizeOrderWarnings(venue.pricing, sizeCategories),
  });
});

// ---- Calendar (PRD O7) -----------------------------------------------------------------

const calendarSchema = z.object({ venueId: objectId, date: isoDate });

router.get('/calendar', validate(calendarSchema, 'query'), async (req, res) => {
  const { venueId, date } = req.valid.query;
  const venue = await ownVenue(req, venueId);
  const tz = venue.timezone;
  const from = dayStart(date, tz);
  const to = from.plus({ days: 1 });
  const window = { startAt: { $lt: to.toJSDate() }, endAt: { $gt: from.toJSDate() } };
  const [areas, bookings, blocks, settings] = await Promise.all([
    Area.find({ venueId: venue._id, active: true }).sort({ createdAt: 1, _id: 1 }),
    Booking.find({ venueId: venue._id, ...window, ...occupyingFilter() }).populate('clientId', 'name phone noShowCount'),
    TimeBlock.find({ venueId: venue._id, ...window }),
    getSettings(),
  ]);
  const payments = await Payment.find({ bookingId: { $in: bookings.map((b) => b._id) }, kind: 'charge', status: 'succeeded' }).select('bookingId method');
  const local = (d) => Math.round(DateTime.fromJSDate(d).setZone(tz).diff(from, 'minutes').minutes);
  const nowMin = (() => {
    const t = localParts(new Date(), tz);
    return t.date === date ? t.min : t.date > date ? Infinity : -1;
  })();

  const events = [];
  for (const b of bookings) {
    const startMin = Math.max(0, local(b.startAt));
    const endMin = Math.min(1440, local(b.endAt));
    const pending = b.status === 'pending_payment';
    events.push({
      id: b.id, kind: 'booking', areaId: b.areaId, startMin, endMin, time: `${fmtMin(startMin)} – ${fmtMin(endMin)}`,
      source: b.source, code: b.code, status: b.status,
      clientName: b.clientId?.name ?? b.guest?.name, phone: formatPhone(b.clientId?.phone ?? b.guest?.phone),
      noShowCount: b.clientId?.noShowCount ?? 0, team: b.note ?? '',
      price: b.price, paidOnline: pending ? 0 : b.amountDueOnline, atVenue: pending ? b.price : b.amountDueAtVenue,
      method: payments.find((p) => p.bookingId.equals(b._id))?.method, holdExpiresAt: b.holdExpiresAt,
      started: startMin <= nowMin, past: endMin <= nowMin,
    });
  }
  for (const bl of blocks) {
    const startMin = Math.max(0, local(bl.startAt));
    const endMin = Math.min(1440, local(bl.endAt));
    for (const a of areas.filter((x) => !bl.areaId || x._id.equals(bl.areaId))) {
      events.push({ id: `${bl.id}:${a.id}`, blockId: bl.id, kind: 'block', areaId: a._id, startMin, endMin, time: `${fmtMin(startMin)} – ${fmtMin(endMin)}`, reason: bl.reason, wholeVenue: !bl.areaId, past: endMin <= nowMin });
    }
  }

  const intervals = openingIntervals(venue, date);
  const counted = events.filter((e) => e.kind === 'booking' && e.status === 'confirmed');
  const openMinutes = areas.length * intervals.reduce((s, i) => s + toMin(i.close) - toMin(i.open), 0);
  const bookedMinutes = counted.reduce((s, e) => s + e.endMin - e.startMin, 0);
  res.json({
    venue: { _id: venue._id, name: venue.name, timezone: tz, paymentMode: venue.paymentMode, depositAmount: venue.depositAmount },
    areas: areas.map((a) => areaView(venue, a, settings.sizeCategories)),
    date,
    dayStart: Math.min(...intervals.map((i) => toMin(i.open)), 1440),
    dayEnd: Math.max(...intervals.map((i) => toMin(i.close)), 0),
    nowMin: Number.isFinite(nowMin) ? nowMin : null,
    events,
    stats: {
      bookings: counted.length,
      online: counted.filter((e) => e.source === 'online').length,
      bookedMinutes,
      occupancy: openMinutes ? bookedMinutes / openMinutes : 0,
      revenue: counted.reduce((s, e) => s + e.price, 0),
      paidOnline: counted.reduce((s, e) => s + e.paidOnline, 0),
      atVenue: counted.reduce((s, e) => s + e.atVenue, 0),
    },
  });
});

// ---- Manual bookings, cancel, no-show (PRD O8, O11, O12) ---------------------------------

const manualSchema = z.object({
  areaId: objectId,
  date: isoDate,
  start: hhmm,
  slotCount: z.number().int().min(1).max(48),
  guestName: z.string().trim().min(2).max(80),
  guestPhone: senegalPhone,
  price: z.number().int().min(0).max(10_000_000).optional(),
  note: z.string().trim().max(60).optional(),
});

router.post('/bookings', validate(manualSchema), async (req, res) => {
  const { areaId, date, start, slotCount, guestName, guestPhone, price, note } = req.valid.body;
  req.params.areaId = areaId;
  const { area, venue } = await ownArea(req);
  const booking = await createBooking({
    venue, area, dateStr: date, start, slotCount, source: 'manual',
    guest: { name: guestName, phone: guestPhone }, priceOverride: price, note, createdBy: req.user,
  });
  res.status(201).json({ booking });
});

router.patch('/bookings/:id/cancel', validate(z.object({ reason: z.string().trim().min(3, 'Indique la raison : le joueur la verra').max(300) })), async (req, res) => {
  const { booking } = await ownBooking(req);
  if (booking.status !== 'confirmed' || booking.startAt <= new Date()) {
    throw new AppError(409, 'NOT_CANCELLABLE', 'Seules les réservations confirmées à venir peuvent être annulées');
  }
  Object.assign(booking, { status: 'cancelled_by_owner', cancelledAt: new Date(), cancelReason: req.valid.body.reason });
  await booking.save();
  const refund = await refundPayment(booking, null, `Annulation par le complexe : ${req.valid.body.reason}`);
  notifier.bookingCancelled(booking._id, refund);
  res.json({ booking, refund: refund ? { amount: refund.amount, status: refund.status } : null });
});

router.patch('/bookings/:id/no-show', async (req, res) => {
  const { booking } = await ownBooking(req);
  if (booking.status !== 'confirmed' || booking.startAt > new Date()) {
    throw new AppError(409, 'NOT_STARTED', 'On peut marquer un joueur absent seulement après le début');
  }
  booking.status = 'no_show';
  await booking.save();
  if (booking.clientId) await User.updateOne({ _id: booking.clientId }, { $inc: { noShowCount: 1 } });
  res.json({ booking });
});

// ---- Time blocks (PRD O10) -------------------------------------------------------------

const blockSchema = z.object({
  venueId: objectId,
  areaId: objectId.nullable().default(null),
  date: isoDate,
  from: hhmm,
  to: hhmm,
  reason: z.string().trim().min(2).max(120),
});

router.post('/time-blocks', validate(blockSchema), async (req, res) => {
  const { venueId, areaId, date, from, to, reason } = req.valid.body;
  const venue = await ownVenue(req, venueId);
  if (toMin(to) <= toMin(from)) throw new AppError(400, 'INVALID_RANGE', 'L’heure de fin doit être après l’heure de début');
  if (areaId && !(await Area.exists({ _id: areaId, venueId }))) throw notFound('Terrain');
  const startAt = atMinute(date, venue.timezone, toMin(from));
  const endAt = atMinute(date, venue.timezone, toMin(to));
  const clash = await Booking.findOne({ venueId, ...(areaId ? { areaId } : {}), startAt: { $lt: endAt }, endAt: { $gt: startAt }, ...occupyingFilter() })
    .populate('clientId', 'name');
  if (clash) {
    throw new AppError(409, 'BLOCK_CLASH', `${clash.areaSnapshot.name} est réservé de ${fmtMin(localParts(clash.startAt, venue.timezone).min)} à ${fmtMin(localParts(clash.endAt, venue.timezone).min)} (${clash.clientId?.name ?? clash.guest?.name}). Annule d’abord cette réservation.`);
  }
  const block = await TimeBlock.create({ venueId, areaId, startAt, endAt, reason, createdBy: req.user._id });
  res.status(201).json({ block });
});

router.delete('/time-blocks/:id', async (req, res) => {
  const block = await TimeBlock.findById(req.params.id);
  if (!block) throw notFound('Blocage');
  await ownVenue(req, block.venueId);
  await block.deleteOne();
  res.status(204).end();
});

// ---- Balance (PRD O14) -----------------------------------------------------------------

const balanceSchema = z.object({ venueId: objectId, month: z.string().regex(/^\d{4}-\d{2}$/).optional() });

router.get('/balance', validate(balanceSchema, 'query'), async (req, res) => {
  const venue = await ownVenue(req, req.valid.query.venueId);
  const all = await LedgerEntry.aggregate([{ $match: { venueId: venue._id } }, { $group: { _id: '$type', total: { $sum: '$amount' } } }]);
  const sum = (t) => all.find((x) => x._id === t)?.total ?? 0;
  const month = req.valid.query.month ?? DateTime.now().setZone(venue.timezone).toFormat('yyyy-LL');
  const start = DateTime.fromISO(`${month}-01`, { zone: venue.timezone });
  const [entries, payouts] = await Promise.all([
    LedgerEntry.find({ venueId: venue._id, createdAt: { $gte: start.toJSDate(), $lt: start.plus({ months: 1 }).toJSDate() } })
      .sort({ createdAt: -1 }).populate('bookingId', 'code startAt areaSnapshot.name').limit(500),
    Payout.find({ venueId: venue._id }).sort({ paidAt: -1 }).limit(20),
  ]);
  res.json({
    totals: {
      receivedOnline: sum('booking_income') + sum('refund'),
      commission: sum('commission') + sum('commission_reversal'),
      payouts: -sum('payout'),
      balance: all.reduce((s, x) => s + x.total, 0),
    },
    month,
    entries,
    payouts,
  });
});

export default router;
