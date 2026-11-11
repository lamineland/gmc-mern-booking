import { DateTime } from 'luxon';
import { Booking } from '../models/Booking.js';
import { Business } from '../models/Business.js';

// Email provider not chosen yet (PRD §11). Plug it into `send`; every other module calls
// the helpers below. In the meantime emails are printed to the console.
async function send({ to, subject, text }) {
  console.log(`\n[email] to: ${to}\n[email] subject: ${subject}\n${text}\n`);
}

const when = (booking, tz) =>
  DateTime.fromJSDate(booking.startAt).setZone(tz).toFormat("ccc d LLL yyyy 'at' HH:mm");

async function loadBooking(bookingId) {
  return Booking.findById(bookingId)
    .populate('clientId', 'name email')
    .populate({ path: 'businessId', select: 'name timezone ownerId', populate: { path: 'ownerId', select: 'email' } });
}

// Fire-and-forget: a failed email must never fail the request that triggered it.
const safe = (fn) => (...args) => fn(...args).catch((err) => console.error('[notifier]', err));

export const notifier = {
  bookingCreated: safe(async (bookingId) => {
    const b = await loadBooking(bookingId);
    const services = b.items.map((i) => i.name).join(', ');
    const at = when(b, b.businessId.timezone);
    await send({
      to: b.clientId.email,
      subject: `Booking confirmed at ${b.businessId.name}`,
      text: `${services} on ${at}. Total: ${b.totalPrice}.`,
    });
    await send({
      to: b.businessId.ownerId.email,
      subject: `New booking: ${b.clientId.name}`,
      text: `${services} on ${at}.`,
    });
  }),

  bookingCancelled: safe(async (bookingId) => {
    const b = await loadBooking(bookingId);
    const at = when(b, b.businessId.timezone);
    const byClient = b.status === 'cancelled_by_client';
    await send({
      to: byClient ? b.businessId.ownerId.email : b.clientId.email,
      subject: `Booking cancelled at ${b.businessId.name}`,
      text: `The booking on ${at} was cancelled by the ${byClient ? 'client' : 'business'}.${
        b.cancelReason ? ` Reason: ${b.cancelReason}` : ''
      }`,
    });
  }),

  businessReviewed: safe(async (businessId) => {
    const biz = await Business.findById(businessId).populate('ownerId', 'email');
    const approved = biz.status === 'approved';
    await send({
      to: biz.ownerId.email,
      subject: `${biz.name} was ${approved ? 'approved' : 'rejected'}`,
      text: approved
        ? 'Your business is now visible to clients.'
        : `Reason: ${biz.rejectionReason}. You can edit it and it will be reviewed again.`,
    });
  }),
};
