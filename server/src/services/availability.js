import { DateTime } from 'luxon';
import { config } from '../config.js';
import { Booking } from '../models/Booking.js';
import { Business } from '../models/Business.js';
import { RentalArea } from '../models/RentalArea.js';
import { Service } from '../models/Service.js';
import { AppError, notFound } from '../utils/AppError.js';

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Opening intervals for a calendar date (YYYY-MM-DD) in the business's timezone. */
export function openingIntervalsFor(business, dateStr) {
  const exception = business.exceptions?.find((e) => e.date === dateStr);
  if (exception) return exception.closed ? [] : exception.intervals;
  const day = DateTime.fromISO(dateStr, { zone: business.timezone }).weekday % 7; // luxon: Mon=1..Sun=7
  return business.openingHours.find((d) => d.day === day)?.intervals ?? [];
}

/**
 * The resource a booking occupies: its rental area if it has one, otherwise the business
 * itself (one booking at a time).
 */
export function resourceFilter(businessId, rentalAreaId) {
  return rentalAreaId ? { rentalAreaId } : { businessId, rentalAreaId: null };
}

/**
 * Validates a client's selection (business + ordered services + optional area) and returns
 * what is needed to compute slots and price.
 */
export async function resolveSelection({ businessId, serviceIds, rentalAreaId, session = null }) {
  const business = await Business.findOne({
    _id: businessId,
    status: 'approved',
    ownerSuspended: false,
  }).session(session);
  if (!business) throw notFound('Business');

  if (serviceIds.length === 0) throw new AppError(400, 'NO_SERVICE', 'Pick at least one service');
  if (serviceIds.length > config.maxServicesPerBooking) {
    throw new AppError(400, 'TOO_MANY_SERVICES', `A booking can hold at most ${config.maxServicesPerBooking} services`);
  }
  if (new Set(serviceIds.map(String)).size !== serviceIds.length) {
    throw new AppError(400, 'DUPLICATE_SERVICE', 'Each service can only be picked once');
  }

  const found = await Service.find({ _id: { $in: serviceIds }, businessId, active: true }).session(session);
  if (found.length !== serviceIds.length) {
    throw new AppError(400, 'INVALID_SERVICE', 'One or more services are not available');
  }
  const services = serviceIds.map((id) => found.find((s) => s._id.equals(id)));

  let area = null;
  if (services.some((s) => s.usesRentalArea)) {
    if (!rentalAreaId) throw new AppError(400, 'AREA_REQUIRED', 'Pick a rental area for this service');
    area = await RentalArea.findOne({ _id: rentalAreaId, businessId, active: true }).session(session);
    if (!area) throw notFound('Rental area');
  }

  return {
    business,
    services,
    area,
    durationMin: services.reduce((sum, s) => sum + s.durationMin, 0),
    totalPrice: services.reduce((sum, s) => sum + s.price, 0),
  };
}

/** Free slots of `durationMin` minutes on `dateStr` for the given resource. */
export async function computeSlots({ business, durationMin, rentalAreaId, dateStr, session = null }) {
  const dayStart = DateTime.fromISO(dateStr, { zone: business.timezone }).startOf('day');
  if (!dayStart.isValid) throw new AppError(400, 'INVALID_DATE', 'Invalid date');

  const intervals = openingIntervalsFor(business, dateStr);
  if (intervals.length === 0) return [];

  const dayEnd = dayStart.plus({ days: 1 });
  const busy = await Booking.find({
    ...resourceFilter(business._id, rentalAreaId),
    status: 'confirmed',
    startAt: { $lt: dayEnd.toJSDate() },
    endAt: { $gt: dayStart.toJSDate() },
  })
    .select('startAt endAt')
    .session(session)
    .lean();

  const now = Date.now();
  const step = business.slotStepMinutes || 30;
  const slots = [];

  for (const { open, close } of intervals) {
    const closeMin = toMinutes(close);
    for (let m = toMinutes(open); m + durationMin <= closeMin; m += step) {
      const start = dayStart.plus({ minutes: m });
      const end = start.plus({ minutes: durationMin });
      if (start.toMillis() <= now) continue;
      const overlaps = busy.some((b) => b.startAt.getTime() < end.toMillis() && b.endAt.getTime() > start.toMillis());
      if (!overlaps) slots.push({ startAt: start.toUTC().toISO(), endAt: end.toUTC().toISO() });
    }
  }
  return slots;
}
