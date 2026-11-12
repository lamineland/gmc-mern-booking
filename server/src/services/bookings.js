/**
 * Booking creation for players (online, pays first) and owners (manual, pays on site).
 * One code path so both get the same double-booking protection (PRD §5.5).
 */
import mongoose from 'mongoose';
import { Area } from '../models/Area.js';
import { Booking } from '../models/Booking.js';
import { getSettings } from '../models/Settings.js';
import { bookingAmounts, quoteSlots } from '../domain/pricing.js';
import { runIsFree } from '../domain/slots.js';
import { atMinute, toMin, weekdayOf } from '../domain/time.js';
import { bookingCode } from '../utils/codes.js';
import { AppError } from '../utils/AppError.js';
import { areaSlots, relatedAreaIds, withinHorizon } from './availability.js';

/** Price, commission and amounts for a selection, without saving anything (GET /areas/:id/quote). */
export async function quote({ venue, area, dateStr, start, slotCount, session = null, excludeBookingId = null }) {
  if (!withinHorizon(venue, area, dateStr)) {
    throw new AppError(409, 'BEYOND_HORIZON', `On peut réserver ce terrain au plus ${area.bookingHorizonDays} jours à l’avance.`);
  }
  if (slotCount < area.minSlots || slotCount > area.maxSlots) {
    throw new AppError(400, 'INVALID_LENGTH', `Durée entre ${area.minSlots * area.slotMinutes} et ${area.maxSlots * area.slotMinutes} minutes.`);
  }
  const startMin = toMin(start);
  const { slots, list } = await areaSlots({ venue, area, dateStr, session, excludeBookingId });
  const i = slots.findIndex((s) => s.start === startMin);
  if (i < 0 || !runIsFree(slots, i, slotCount)) {
    throw new AppError(409, 'SLOT_UNAVAILABLE', 'Ce créneau n’est plus disponible.');
  }
  const { breakdown, price } = quoteSlots(list, weekdayOf(dateStr, venue.timezone), startMin, slotCount, area.slotMinutes);
  const settings = await getSettings();
  const amounts = bookingAmounts({
    price,
    paymentMode: venue.paymentMode,
    depositAmount: venue.depositAmount,
    commissionRate: venue.commissionRate ?? settings.commissionRate,
    commissionMin: settings.commissionMin,
    commissionMax: settings.commissionMax,
  });
  const tz = venue.timezone;
  return {
    startAt: atMinute(dateStr, tz, startMin),
    endAt: atMinute(dateStr, tz, startMin + slotCount * area.slotMinutes),
    price,
    priceBreakdown: breakdown.map((b) => ({ startAt: atMinute(dateStr, tz, b.min), price: b.price })),
    paymentMode: venue.paymentMode,
    ...amounts,
  };
}

/**
 * Creates a booking inside a transaction. The area documents (and linked areas) are written
 * first, so two concurrent transactions on the same area conflict: MongoDB aborts one, the
 * driver retries it, and the retry sees the other booking and gets SLOT_UNAVAILABLE.
 *
 * source 'online'  → pending_payment, holds the slot for `holdMinutes`, commission applies.
 * source 'manual'  → confirmed, paid on site, no commission (PRD O8), price can be overridden.
 */
export async function createBooking({ venue, area, dateStr, start, slotCount, source, client = null, guest = null, priceOverride, note, createdBy, idempotencyKey }) {
  if (idempotencyKey && client) {
    const existing = await Booking.findOne({ clientId: client._id, idempotencyKey });
    if (existing) return existing;
  }
  const settings = await getSettings();
  let booking;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const ids = await relatedAreaIds(area, session);
      await Area.updateMany({ _id: { $in: ids } }, { $inc: { lockVersion: 1 } }, { session });

      const q = await quote({ venue, area, dateStr, start, slotCount, session });
      const online = source === 'online';
      const price = !online && priceOverride != null ? priceOverride : q.price;
      const doc = {
        code: bookingCode(),
        venueId: venue._id,
        areaId: area._id,
        clientId: client?._id ?? null,
        guest: guest ?? undefined,
        source,
        startAt: q.startAt,
        endAt: q.endAt,
        slotCount,
        price,
        currency: venue.currency,
        priceBreakdown: q.priceBreakdown,
        areaSnapshot: { name: area.name, format: area.format, sport: area.sport, sizeCategory: area.sizeCategory, lengthM: area.lengthM, widthM: area.widthM },
        note,
        createdBy: createdBy?._id,
        idempotencyKey,
        ...(online
          ? {
              status: 'pending_payment',
              holdExpiresAt: new Date(Date.now() + settings.holdMinutes * 60 * 1000),
              paymentMode: q.paymentMode,
              commissionRate: q.commissionRate,
              commission: q.commission,
              amountDueOnline: q.amountDueOnline,
              amountDueAtVenue: q.amountDueAtVenue,
              ownerNet: q.ownerNet,
            }
          : { status: 'confirmed', paymentMode: 'on_site', amountDueAtVenue: price }),
      };
      [booking] = await Booking.create([doc], { session });
    });
  } finally {
    await session.endSession();
  }
  return booking;
}
