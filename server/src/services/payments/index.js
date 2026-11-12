/**
 * Payments service (PRD v2.2 §5.1, §5.6, §6). Owns the business logic; drivers only talk to
 * providers. To add a real provider: write a driver with the same 5 functions as mockDriver
 * and register it in DRIVERS, then set PAYMENT_PROVIDER.
 */
import mongoose from 'mongoose';
import { config } from '../../config.js';
import { Area } from '../../models/Area.js';
import { Booking } from '../../models/Booking.js';
import { LedgerEntry } from '../../models/LedgerEntry.js';
import { Payment } from '../../models/Payment.js';
import { Venue } from '../../models/Venue.js';
import { localParts, fmtMin } from '../../domain/time.js';
import { runIsFree } from '../../domain/slots.js';
import { AppError } from '../../utils/AppError.js';
import { areaSlots, relatedAreaIds } from '../availability.js';
import { notifier } from '../notifier.js';

const DRIVERS = {};
if (!config.isProd) DRIVERS.mock = (await import('./mockDriver.js')).mockDriver;

export function driver(name = config.paymentProvider) {
  const d = DRIVERS[name];
  if (!d) throw new AppError(500, 'NO_PAYMENT_PROVIDER', `Payment provider "${name}" is not available`);
  return d;
}

export const paymentMethods = () => driver().methods();

/** Starts (or restarts, after a failure) the online payment of a pending booking. */
export async function startPayment({ booking, method, phone }) {
  if (booking.status !== 'pending_payment' || booking.holdExpiresAt <= new Date()) {
    throw new AppError(409, 'HOLD_EXPIRED', 'Le délai de paiement est dépassé, le créneau a été libéré.');
  }
  if (await Payment.exists({ bookingId: booking._id, kind: 'charge', status: 'pending' })) {
    throw new AppError(409, 'PAYMENT_IN_PROGRESS', 'Un paiement est déjà en cours pour cette réservation.');
  }
  const d = driver();
  const payment = await Payment.create({
    bookingId: booking._id,
    venueId: booking.venueId,
    clientId: booking.clientId,
    kind: 'charge',
    provider: d.name,
    method,
    phone,
    amount: booking.amountDueOnline,
    currency: booking.currency,
  });
  try {
    const r = await d.createPayment({
      paymentId: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      method,
      customerPhone: phone,
      description: `WinPitch ${booking.code}`,
      returnUrl: `${config.clientUrl}/payment/${booking._id}`,
      callbackUrl: `${config.apiUrl}/api/v1/webhooks/payments/${d.name}`,
    });
    Object.assign(payment, { providerRef: r.providerRef, redirectUrl: r.redirectUrl });
    await payment.save();
    return { payment, redirectUrl: r.redirectUrl, instructions: r.instructions };
  } catch (err) {
    Object.assign(payment, { status: 'failed', failureReason: 'Le service de paiement ne répond pas.' });
    await payment.save();
    throw err;
  }
}

async function writeLedger(booking, payment, entries, session = null) {
  const docs = entries.filter(([, amount]) => amount).map(([type, amount]) => ({ venueId: booking.venueId, bookingId: booking._id, paymentId: payment?._id, type, amount }));
  if (docs.length) await LedgerEntry.create(docs, { session, ordered: true });
}

/**
 * Confirms a paid booking. If its hold expired before the money arrived, it is confirmed
 * only if the slot is still free; otherwise it is marked expired and refunded (PRD §5.1).
 */
async function confirmPaid(booking, payment) {
  if (booking.status === 'pending_payment' && booking.holdExpiresAt > new Date()) {
    booking.status = 'confirmed';
  } else if (['pending_payment', 'expired'].includes(booking.status)) {
    const venue = await Venue.findById(booking.venueId);
    const area = await Area.findById(booking.areaId);
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await Area.updateMany({ _id: { $in: await relatedAreaIds(area, session) } }, { $inc: { lockVersion: 1 } }, { session });
        const { date, min } = localParts(booking.startAt, venue.timezone);
        const { slots } = await areaSlots({ venue, area, dateStr: date, session, excludeBookingId: booking._id });
        const i = slots.findIndex((s) => s.start === min);
        booking.status = i >= 0 && runIsFree(slots, i, booking.slotCount) ? 'confirmed' : 'expired';
        await booking.save({ session });
      });
    } finally {
      await session.endSession();
    }
  } else {
    // Cancelled, or already confirmed by an earlier payment: give this money back. It was
    // never counted as income, so the owner's ledger doesn't move.
    await refundPayment(booking, payment, 'Paiement en double ou réservation annulée', { countsInLedger: false });
    return;
  }
  booking.holdExpiresAt = undefined;
  await booking.save();
  if (booking.status === 'confirmed') {
    await writeLedger(booking, payment, [['booking_income', booking.amountDueOnline], ['commission', -booking.commission]]);
    notifier.bookingConfirmed(booking._id);
  } else {
    await refundPayment(booking, payment, 'Créneau pris pendant le paiement');
  }
}

/** Applies a provider event. Idempotent: the same eventId is only processed once. */
export async function handleEvent(event) {
  const payment = await Payment.findOne({ providerRef: event.providerRef });
  if (!payment) throw new AppError(404, 'NOT_FOUND', 'Unknown payment');
  if (event.eventId && payment.events.some((e) => e.eventId === event.eventId)) return { duplicate: true };
  if (event.amount != null && event.amount !== payment.amount) {
    throw new AppError(400, 'AMOUNT_MISMATCH', 'Amount does not match the payment');
  }
  payment.events.push({ eventId: event.eventId, status: event.status, receivedAt: new Date(), raw: event.raw });
  if (payment.status !== 'pending') {
    await payment.save();
    return { ignored: true };
  }
  payment.status = event.status === 'succeeded' ? 'succeeded' : 'failed';
  if (payment.status === 'failed') payment.failureReason = event.raw?.reason ?? 'Paiement refusé par l’opérateur.';
  await payment.save();

  const booking = await Booking.findById(payment.bookingId);
  if (payment.status === 'succeeded') await confirmPaid(booking, payment);
  return { ok: true, status: payment.status };
}

/** Refunds the successful charge of a booking (cancellation, late payment). Failed refunds wait for the admin. */
export async function refundPayment(booking, charge = null, reason = '', { countsInLedger = true } = {}) {
  charge ??= await Payment.findOne({ bookingId: booking._id, kind: 'charge', status: 'succeeded' });
  if (!charge) return null;
  const refund = await Payment.create({
    bookingId: booking._id,
    venueId: booking.venueId,
    clientId: booking.clientId,
    kind: 'refund',
    provider: charge.provider,
    method: charge.method,
    phone: charge.phone,
    amount: charge.amount,
    currency: charge.currency,
    reason: reason || undefined,
    countsInLedger,
  });
  return settleRefund(booking, charge, refund);
}

async function settleRefund(booking, charge, refund) {
  try {
    const r = await driver(charge.provider).refund({ providerRef: charge.providerRef, amount: refund.amount, reason: refund.reason });
    refund.providerRef = r.refundRef;
    refund.status = r.status === 'succeeded' ? 'succeeded' : 'refund_failed';
    if (refund.status === 'refund_failed') refund.failureReason = 'Remboursement refusé par l’opérateur.';
  } catch {
    Object.assign(refund, { status: 'refund_failed', failureReason: 'Le service de paiement ne répond pas.' });
  }
  await refund.save();
  if (refund.status === 'succeeded' && refund.countsInLedger) {
    // Only money that was counted as income goes back out of the owner's balance.
    const wasIncome = await LedgerEntry.exists({ bookingId: booking._id, type: 'booking_income' });
    if (wasIncome) await writeLedger(booking, refund, [['refund', -refund.amount], ['commission_reversal', booking.commission]]);
  }
  return refund;
}

/** Admin: retry a refund that failed. */
export async function retryRefund(refundId) {
  const refund = await Payment.findOne({ _id: refundId, kind: 'refund', status: 'refund_failed' });
  if (!refund) throw new AppError(404, 'NOT_FOUND', 'Remboursement introuvable ou déjà effectué');
  const booking = await Booking.findById(refund.bookingId);
  const charge = await Payment.findOne({ bookingId: booking._id, kind: 'charge', status: 'succeeded', providerRef: { $exists: true } })
    .sort({ createdAt: -1 });
  return settleRefund(booking, charge, refund);
}

/** Every minute: release expired holds; check payments stuck in "pending" for 15+ minutes. */
export async function runPaymentJobs(now = new Date()) {
  const expired = await Booking.find({ status: 'pending_payment', holdExpiresAt: { $lte: now } }).select('_id');
  if (expired.length) {
    const ids = expired.map((b) => b._id);
    await Booking.updateMany({ _id: { $in: ids }, status: 'pending_payment' }, { status: 'expired' });
    await Payment.updateMany({ bookingId: { $in: ids }, kind: 'charge', status: 'pending', createdAt: { $lte: new Date(now - 15 * 60e3) } }, { status: 'expired' });
  }
  const stuck = await Payment.find({ kind: 'charge', status: 'pending', providerRef: { $exists: true }, createdAt: { $lte: new Date(now - 15 * 60e3) } }).limit(50);
  for (const p of stuck) {
    const s = await driver(p.provider).getPaymentStatus(p.providerRef).catch(() => null);
    if (s && s.status !== 'pending') await handleEvent({ providerRef: p.providerRef, eventId: `reconcile_${p.id}_${s.status}`, status: s.status, amount: s.amount, raw: { reconciled: true } });
    else if (!s || now - p.createdAt > 60 * 60e3) await Payment.updateOne({ _id: p._id }, { status: 'expired' });
  }
}

export function startPaymentJobs() {
  const tick = () => runPaymentJobs().catch((err) => console.error('[payments] job failed', err));
  tick();
  return setInterval(tick, 60 * 1000);
}

/** "18:30" label for messages. */
export const startLabel = (booking, tz) => fmtMin(localParts(booking.startAt, tz).min);
