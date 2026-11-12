/**
 * Availability for areas, from the database: who/what occupies an area on a day, and the
 * resulting slot grid. The rules themselves are in domain/ (pure, unit-tested).
 */
import { DateTime } from 'luxon';
import { Area } from '../models/Area.js';
import { ACTIVE_STATUSES, Booking } from '../models/Booking.js';
import { TimeBlock } from '../models/TimeBlock.js';
import { priceListFor } from '../domain/pricing.js';
import { daySlots } from '../domain/slots.js';
import { dayStart, localParts } from '../domain/time.js';
import { AppError } from '../utils/AppError.js';

/** Areas whose bookings also block `area`: itself, the areas it includes, and the areas that include it. */
export async function relatedAreaIds(area, session = null) {
  const parents = await Area.find({ linkedAreaIds: area._id }).select('_id').session(session).lean();
  return [area._id, ...(area.linkedAreaIds ?? []), ...parents.map((p) => p._id)];
}

/** Mongo filter for bookings that occupy their slot right now (confirmed, no-show, or a live payment hold). */
export const occupyingFilter = (now = new Date()) => ({
  $or: [{ status: { $in: ACTIVE_STATUSES } }, { status: 'pending_payment', holdExpiresAt: { $gt: now } }],
});

/** Busy ranges [startMin, endMin) in local minutes of `dateStr`. */
export async function busyRanges({ venue, area, dateStr, session = null, excludeBookingId = null }) {
  const from = dayStart(dateStr, venue.timezone);
  const to = from.plus({ days: 1 });
  const areaIds = await relatedAreaIds(area, session);
  const window = { startAt: { $lt: to.toJSDate() }, endAt: { $gt: from.toJSDate() } };
  const [bookings, blocks] = await Promise.all([
    Booking.find({ areaId: { $in: areaIds }, ...window, ...occupyingFilter(), ...(excludeBookingId ? { _id: { $ne: excludeBookingId } } : {}) })
      .select('startAt endAt').session(session).lean(),
    TimeBlock.find({ venueId: venue._id, $or: [{ areaId: null }, { areaId: { $in: areaIds } }], ...window })
      .select('startAt endAt').session(session).lean(),
  ]);
  const toLocal = (d) => DateTime.fromJSDate(d).setZone(venue.timezone).diff(from, 'minutes').minutes;
  return [...bookings, ...blocks].map((r) => [Math.max(0, toLocal(r.startAt)), Math.min(24 * 60, toLocal(r.endAt))]);
}

/** Minutes since local midnight for "now" relative to `dateStr`: Infinity for past days, -1 for future days. */
export function nowMinFor(venue, dateStr, now = new Date()) {
  const today = localParts(now, venue.timezone);
  if (dateStr < today.date) return Infinity;
  if (dateStr > today.date) return -1;
  return today.min;
}

/** Is `dateStr` within the area's booking horizon? */
export function withinHorizon(venue, area, dateStr, now = new Date()) {
  const today = DateTime.fromJSDate(now).setZone(venue.timezone).startOf('day');
  return dayStart(dateStr, venue.timezone).diff(today, 'days').days <= area.bookingHorizonDays;
}

/** Slot grid for one area on one date, with prices. Throws if the area has no price list. */
export async function areaSlots({ venue, area, dateStr, session = null, excludeBookingId = null }) {
  const list = priceListFor(venue, area);
  if (!list) throw new AppError(409, 'NO_PRICE', `${area.name} n’a pas encore de tarif.`);
  const busy = await busyRanges({ venue, area, dateStr, session, excludeBookingId });
  const slots = daySlots({ venue, area, list, dateStr, busy, nowMin: nowMinFor(venue, dateStr) });
  return { slots, list };
}
