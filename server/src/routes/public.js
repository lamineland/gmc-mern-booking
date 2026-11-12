/** Public, read-only routes: search, venue pages, slot grids and quotes (PRD §8 "Public"). */
import { Router } from 'express';
import { z } from 'zod';
import { Area } from '../models/Area.js';
import { getSettings } from '../models/Settings.js';
import { Venue } from '../models/Venue.js';
import { fmtMin } from '../domain/time.js';
import { validate } from '../middleware/validate.js';
import { areaSlots, withinHorizon } from '../services/availability.js';
import { quote } from '../services/bookings.js';
import { paymentMethods } from '../services/payments/index.js';
import { areaView, publicVenue, searchVenues, visibleVenueFilter } from '../services/venues.js';
import { atMinute } from '../domain/time.js';
import { notFound } from '../utils/AppError.js';
import { hhmm, isoDate, objectId, pagination } from '../utils/schemas.js';

const router = Router();

router.get('/meta', async (req, res) => {
  const s = await getSettings();
  res.json({
    currency: 'XOF',
    sizeCategories: s.sizeCategories,
    cancellationCutoffHours: s.cancellationCutoffHours,
    holdMinutes: s.holdMinutes,
    paymentMethods: paymentMethods(),
  });
});

const searchSchema = z.object({
  city: z.string().trim().max(80).optional(),
  district: z.string().trim().max(80).optional(),
  sport: z.string().trim().max(30).optional(),
  size: z.string().trim().max(30).optional(),
  date: isoDate.optional(),
  time: hhmm.optional(),
  duration: z.coerce.number().int().min(15).max(720).optional(),
  ...pagination,
});

router.get('/venues', validate(searchSchema, 'query'), async (req, res) => {
  res.json(await searchVenues(req.valid.query));
});

router.get('/venues/districts', async (req, res) => {
  const rows = await Venue.aggregate([
    { $match: visibleVenueFilter },
    { $group: { _id: { city: '$city', district: '$district' } } },
    { $sort: { '_id.city': 1, '_id.district': 1 } },
  ]);
  res.json({ items: rows.map((r) => r._id) });
});

async function visibleVenue(id) {
  const venue = await Venue.findOne({ _id: id, ...visibleVenueFilter });
  if (!venue) throw notFound('Complexe');
  return venue;
}

router.get('/venues/:id', validate(z.object({ id: objectId }), 'params'), async (req, res) => {
  const venue = await visibleVenue(req.params.id);
  const [areas, settings] = await Promise.all([Area.find({ venueId: venue._id, active: true }).sort({ createdAt: 1, _id: 1 }), getSettings()]);
  res.json({ venue: publicVenue(venue), areas: areas.map((a) => areaView(venue, a, settings.sizeCategories)), sizeCategories: settings.sizeCategories });
});

async function visibleArea(id) {
  const area = await Area.findOne({ _id: id, active: true });
  if (!area) throw notFound('Terrain');
  return { area, venue: await visibleVenue(area.venueId) };
}

router.get(
  '/areas/:id/availability',
  validate(z.object({ id: objectId }), 'params'),
  validate(z.object({ date: isoDate }), 'query'),
  async (req, res) => {
    const { area, venue } = await visibleArea(req.params.id);
    const { date } = req.valid.query;
    const bookable = withinHorizon(venue, area, date);
    const { slots } = await areaSlots({ venue, area, dateStr: date });
    res.json({
      date,
      timezone: venue.timezone,
      slotMinutes: area.slotMinutes,
      minSlots: area.minSlots,
      maxSlots: area.maxSlots,
      bookable,
      slots: slots.map((s) => ({
        start: fmtMin(s.start),
        end: fmtMin(s.end),
        startAt: atMinute(date, venue.timezone, s.start),
        price: s.price,
        peak: s.peak,
        state: bookable || s.state !== 'free' ? s.state : 'closed',
      })),
    });
  },
);

router.get(
  '/areas/:id/quote',
  validate(z.object({ id: objectId }), 'params'),
  validate(z.object({ date: isoDate, start: hhmm, slots: z.coerce.number().int().min(1).max(48) }), 'query'),
  async (req, res) => {
    const { area, venue } = await visibleArea(req.params.id);
    const { date, start, slots } = req.valid.query;
    const q = await quote({ venue, area, dateStr: date, start, slotCount: slots });
    // The commission is between the platform and the owner; players see what they pay.
    res.json({
      startAt: q.startAt, endAt: q.endAt, price: q.price, priceBreakdown: q.priceBreakdown,
      paymentMode: q.paymentMode, amountDueOnline: q.amountDueOnline, amountDueAtVenue: q.amountDueAtVenue,
    });
  },
);

export default router;
