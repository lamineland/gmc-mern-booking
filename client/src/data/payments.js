/**
 * Player bookings and payments, from the API (PRD v2.2 §8 "Player", §6). Responses are mapped
 * to the shapes the checkout, payment status and "Mes réservations" screens use.
 * A booking's id is also its payment reference in URLs (/payment/:bookingId).
 */
import { api } from '../api.js';
import { META, fetchVenue, fmtMin, localDateTime, toMin } from './venues.js';

export const WALLETS = {
  wave: { label: 'Wave', short: 'W', hint: 'Paiement instantané depuis ton app Wave', pending: 'Ouvre ton app Wave et valide le paiement de' },
  orange_money: {
    label: 'Orange Money', short: 'OM', hint: 'Valide avec ton code secret Orange Money',
    pending: 'Tu vas recevoir une demande Orange Money. Valide avec ton code secret (ou compose #144#) pour payer',
  },
  free_money: { label: 'Free Money', short: 'FM', hint: 'Valide le message Free Money sur ton téléphone', pending: 'Tu vas recevoir un message Free Money. Valide-le pour payer' },
};

/** True when the payment page is the dev-only mock provider (the app then shows its own test panel). */
export const isMockRedirect = (url) => Boolean(url?.includes('/api/v1/mock-pay/'));

/** Price check before paying: GET /areas/:id/quote (the server refuses if the slot is no longer free). */
export async function quote({ venueId, areaId, date, start, len }) {
  const venue = await fetchVenue(venueId);
  const area = venue.areas.find((a) => a.id === areaId);
  if (!area) throw new Error('Terrain introuvable');
  const q = await api(`/areas/${areaId}/quote?date=${date}&start=${start}&slots=${len}`);
  return {
    venue, area, date, start,
    end: fmtMin(toMin(start) + Number(len) * area.slotMinutes),
    slotCount: Number(len),
    price: q.price,
    payNow: q.amountDueOnline,
    atVenue: q.amountDueAtVenue,
  };
}

/** POST /bookings: holds the slot and starts the payment. Returns the booking id and where to pay. */
export async function createBookingAndPay({ areaId, date, start, len, method, phone, note }) {
  const res = await api('/bookings', {
    method: 'POST',
    headers: { 'Idempotency-Key': crypto.randomUUID() },
    body: { areaId, date, start, slotCount: Number(len), method, phone, note: note || undefined },
  });
  return { ref: res.booking._id, redirectUrl: res.redirectUrl, instructions: res.instructions };
}

/** API booking → the flat shape the payment and booking screens use. */
function view(b) {
  const v = b.venueId ?? {};
  const tz = v.timezone ?? 'Africa/Dakar';
  const start = localDateTime(b.startAt, tz);
  const end = localDateTime(b.endAt, tz);
  const pay = b.payment;
  const now = Date.now();
  const holdLive = b.status === 'pending_payment' && new Date(b.holdExpiresAt).getTime() > now;
  // Payment screen status: pending | failed | succeeded | expired | cancelled_*
  let status = b.status;
  if (b.status === 'pending_payment') status = !holdLive ? 'expired' : pay?.status === 'failed' ? 'failed' : 'pending';
  else if (b.status === 'confirmed' || b.status === 'no_show') status = 'succeeded';
  const startMs = new Date(b.startAt).getTime();
  return {
    ref: b._id,
    code: b.code,
    method: pay?.method ?? 'wave',
    phone: (pay?.phone ?? '').replace(/^\+221(\d{2})(\d{3})(\d{2})(\d{2})$/, '+221 $1 $2 $3 $4'),
    note: b.note ?? '',
    status,
    // "Mes réservations" status: confirmed | pending_payment | completed | no_show | cancelled_*
    listStatus: holdLive ? 'pending_payment' : b.displayStatus ?? b.status,
    holdExpiresAt: b.holdExpiresAt ? new Date(b.holdExpiresAt).getTime() : 0,
    failureReason: pay?.status === 'failed' ? pay.failureReason : null,
    redirectUrl: pay?.redirectUrl,
    cancelReason: b.cancelReason,
    refund: b.refund ? { amount: b.refund.amount, status: b.refund.status } : null,
    startMs,
    endMs: new Date(b.endAt).getTime(),
    cancellable: b.status === 'confirmed' && startMs - META.cancellationCutoffHours * 3600e3 > now,
    booking: {
      venueId: v._id,
      venueName: v.name,
      venueAddress: [v.address, v.district].filter(Boolean).join(', '),
      venuePhone: v.phone,
      areaId: b.areaId,
      areaName: b.areaSnapshot?.name,
      areaFormat: b.areaSnapshot?.format,
      sport: b.areaSnapshot?.sport,
      date: start.date,
      start: start.time,
      end: end.time === '00:00' ? '24:00' : end.time,
      slotCount: b.slotCount,
      price: b.price,
      payNow: b.amountDueOnline,
      atVenue: b.amountDueAtVenue,
    },
  };
}

export async function getPayment(ref) {
  const { booking } = await api(`/bookings/${ref}`);
  return view(booking);
}

/** Dev only: answer as the mock provider would (Payer / Échec). */
export async function simulate(ref, outcome) {
  const p = await getPayment(ref);
  const providerRef = p.redirectUrl?.split('/').pop();
  if (!providerRef) return;
  await api(`/mock-pay/${providerRef}/${outcome === 'success' ? 'success' : 'fail'}`, { method: 'POST', headers: { Accept: 'application/json' } });
}

/** "Réessayer" after a failure: same booking and hold, new payment attempt. */
export async function retry(ref, { method, phone }) {
  const res = await api(`/bookings/${ref}/pay`, { method: 'POST', body: { method, phone } });
  return { redirectUrl: res.redirectUrl };
}

export const PAGE_SIZE = 20;

/** GET /bookings/me: one page of one tab, plus the true totals of every tab (for the badges). */
export async function listMyBookings(tab, page = 1) {
  const res = await api(`/bookings/me?tab=${tab}&page=${page}&limit=${PAGE_SIZE}`);
  META.cancellationCutoffHours = res.cancellationCutoffHours;
  return {
    items: res.bookings.map((b) => {
      const v = view(b);
      return { ...v, status: v.listStatus };
    }),
    counts: res.counts,
    page: res.page,
    hasMore: res.hasMore,
  };
}

export async function cancelBooking(ref) {
  const { booking } = await api(`/bookings/${ref}/cancel`, { method: 'PATCH' });
  return { refund: booking.refund ?? { amount: 0 }, method: booking.payment?.method ?? 'wave' };
}
