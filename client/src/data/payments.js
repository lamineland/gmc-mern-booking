/**
 * Mock of the booking + payment API (PRD v2.2 §5.1, §6). It mirrors what the server will do:
 * create a `pending_payment` booking that holds the slot for 10 minutes, start a payment with
 * a wallet, then confirm or fail it when the provider answers. Here the "provider" is the test
 * panel on the payment status page, or these phone-number rules (PRD §6.3):
 *   number ending in 00 → succeeds after 3 s · 01 → fails · 02 → never answers.
 * State is kept in sessionStorage so a page reload keeps the flow going.
 * When the backend lands: createBookingAndPay → POST /bookings, getPayment → GET /bookings/:id,
 * simulate → the dev-only /mock-pay routes.
 */
import { VENUES } from './mockVenues.js';
import { KEYS, readJSON, writeJSON } from './store.js';
import { areaDay, fetchVenue, fmtMin, isoOf, pricingOf, runIsFree, slotPrice, toMin, weekdayOf } from './venues.js';

export const HOLD_MINUTES = 10;

export const WALLETS = {
  wave: {
    label: 'Wave',
    short: 'W',
    hint: 'Paiement instantané depuis ton app Wave',
    pending: 'Ouvre ton app Wave et valide le paiement de',
  },
  orange_money: {
    label: 'Orange Money',
    short: 'OM',
    hint: 'Valide avec ton code secret Orange Money',
    pending: 'Tu vas recevoir une demande Orange Money. Valide avec ton code secret (ou compose #144#) pour payer',
  },
  free_money: {
    label: 'Free Money',
    short: 'FM',
    hint: 'Valide le message Free Money sur ton téléphone',
    pending: 'Tu vas recevoir un message Free Money. Valide-le pour payer',
  },
};

let memory = readJSON(KEYS.payments, {});
const commit = () => writeJSON(KEYS.payments, memory);
/** Other modules (owner calendar) write here too: always start from the stored copy. */
const reload = () => { memory = readJSON(KEYS.payments, memory); };

const code = () => `WP-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Server-side price check: returns the quote or throws if the slot is no longer free. */
export async function quote({ venueId, areaId, date, start, len }) {
  const venue = await fetchVenue(venueId);
  const area = venue.areas.find((a) => a.id === areaId);
  if (!area) throw new Error('Terrain introuvable');
  const slots = areaDay(venue, area, date);
  const i = slots.findIndex((s) => s.time === start);
  const count = Number(len);
  if (i < 0 || count < area.minSlots || count > area.maxSlots || !runIsFree(slots, i, count)) {
    const err = new Error('Ce créneau n’est plus disponible.');
    err.code = 'SLOT_UNAVAILABLE';
    throw err;
  }
  const picked = slots.slice(i, i + count);
  const price = picked.reduce((sum, s) => sum + s.price, 0);
  const payNow = venue.paymentMode === 'deposit' ? Math.min(venue.depositAmount, price) : price;
  return {
    venue,
    area,
    date,
    start,
    end: fmtMin(picked[picked.length - 1].end),
    slotCount: count,
    slots: picked,
    price,
    payNow,
    atVenue: price - payNow,
  };
}

/** POST /bookings: holds the slot and starts the payment. */
export async function createBookingAndPay({ venueId, areaId, date, start, len, method, phone, note, clientName }) {
  const q = await quote({ venueId, areaId, date, start, len });
  reload();
  await wait(400);
  const now = Date.now();
  const ref = `pay_${now.toString(36)}`;
  memory[ref] = {
    ref,
    code: code(),
    method,
    phone,
    note: note || '',
    clientName: clientName || 'Joueur WinPitch',
    status: 'pending', // pending | succeeded | failed | expired
    createdAt: now,
    holdExpiresAt: now + HOLD_MINUTES * 60 * 1000,
    failureReason: null,
    booking: {
      venueId,
      venueName: q.venue.name,
      venueAddress: `${q.venue.address}, ${q.venue.district}`,
      venuePhone: q.venue.phone,
      areaId,
      areaName: q.area.name,
      areaFormat: q.area.format,
      sport: q.area.sport,
      date,
      start,
      end: q.end,
      slotCount: q.slotCount,
      price: q.price,
      payNow: q.payNow,
      atVenue: q.atVenue,
    },
  };
  commit();
  return { ref };
}

/** GET /bookings/:id: current status, applying hold expiry and the test phone-number rules. */
export async function getPayment(ref) {
  await wait(150);
  reload();
  const p = memory[ref];
  if (!p) throw new Error('Paiement introuvable');
  if (p.status === 'pending') {
    const ending = p.phone.replace(/\D/g, '').slice(-2);
    if (ending === '00' && Date.now() - p.createdAt > 3000) p.status = 'succeeded';
    else if (ending === '01' && Date.now() - p.createdAt > 3000) {
      p.status = 'failed';
      p.failureReason = 'Solde insuffisant sur le compte.';
    } else if (Date.now() > p.holdExpiresAt) p.status = 'expired';
    commit();
  }
  return { ...p };
}

/** Test panel: what the provider's webhook would tell us. */
export async function simulate(ref, outcome) {
  reload();
  const p = memory[ref];
  if (!p || p.status !== 'pending') return;
  if (outcome === 'success') p.status = 'succeeded';
  if (outcome === 'fail') {
    p.status = 'failed';
    p.failureReason = 'Paiement refusé par l’opérateur.';
  }
  if (outcome === 'expire') p.status = 'expired';
  commit();
}

/** "Réessayer" after a failure: same booking and hold, new payment attempt. */
export async function retry(ref, { method, phone }) {
  reload();
  const p = memory[ref];
  if (!p || p.status !== 'failed' || Date.now() > p.holdExpiresAt) throw new Error('Le créneau a été libéré.');
  Object.assign(p, { method, phone, status: 'pending', failureReason: null, createdAt: Date.now() });
  commit();
}

/* ───────────── My bookings (GET /bookings/me, PATCH /bookings/:id/cancel) ───────────── */

export const CANCELLATION_CUTOFF_HOURS = 2;

const startMsOf = (b) => {
  const [y, m, d] = b.date.split('-').map(Number);
  return new Date(y, m - 1, d, 0, toMin(b.start)).getTime();
};
const endMsOf = (b) => {
  const [y, m, d] = b.date.split('-').map(Number);
  const end = toMin(b.end) <= toMin(b.start) ? toMin(b.end) + 1440 : toMin(b.end); // ends at midnight
  return new Date(y, m - 1, d, 0, end).getTime();
};

/** A few past bookings so the history tabs aren't empty in the demo. Added once per session. */
function seedDemoHistory() {
  if (memory.__seeded) return;
  const now = new Date();
  const make = (venueId, areaId, dayOffset, start, slotCount, method, extra) => {
    const venue = VENUES.find((v) => v.id === venueId);
    const area = venue.areas.find((a) => a.id === areaId);
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset);
    const date = isoOf(day);
    const pricing = pricingOf(venue, area);
    let price = 0;
    for (let k = 0; k < slotCount; k++) price += slotPrice(pricing, weekdayOf(date), toMin(start) + k * area.slotMinutes);
    const payNow = venue.paymentMode === 'deposit' ? Math.min(venue.depositAmount, price) : price;
    const ref = `demo_${areaId}_${dayOffset}`;
    memory[ref] = {
      ref, code: code(), method, phone: '+221 77 123 45 67', note: '', status: 'succeeded',
      createdAt: day.getTime() - 3 * 86400e3, holdExpiresAt: 0, failureReason: null, demo: true,
      booking: {
        venueId, venueName: venue.name, venueAddress: `${venue.address}, ${venue.district}`, venuePhone: venue.phone,
        areaId, areaName: area.name, areaFormat: area.format, sport: area.sport,
        date, start, end: fmtMin(toMin(start) + slotCount * area.slotMinutes), slotCount,
        price, payNow, atVenue: price - payNow,
      },
      ...extra,
    };
  };
  make('almadies-five', 'alm-1', -6, '19:00', 2, 'wave');
  make('grand-yoff-hoops', 'gy-1', -13, '18:00', 3, 'orange_money');
  make('parcelles-foot-park', 'par-1', -3, '20:00', 2, 'wave', {
    status: 'cancelled_by_client', cancelledAt: Date.now() - 4 * 86400e3,
    refund: { amount: 5000, status: 'succeeded' },
  });
  make('mermoz-padel', 'mer-1', -9, '18:30', 2, 'free_money', {
    status: 'cancelled_by_owner', cancelledAt: Date.now() - 10 * 86400e3,
    cancelReason: 'Court fermé pour réparation de la vitre.', refund: { amount: 5000, status: 'succeeded' },
  });
  memory.__seeded = true;
  commit();
}

/**
 * Display status, as the server will compute it:
 * confirmed → completed once the end time has passed; a payment still in its hold → pending_payment;
 * expired holds and abandoned payments are not listed.
 */
function view(p, now) {
  const b = p.booking;
  const startMs = startMsOf(b);
  const endMs = endMsOf(b);
  let status = p.status;
  if (status === 'succeeded') status = endMs < now ? 'completed' : 'confirmed';
  else if ((status === 'pending' || status === 'failed') && now < p.holdExpiresAt) status = 'pending_payment';
  else if (status === 'pending' || status === 'failed' || status === 'expired') return null;
  const cancellable = status === 'confirmed' && startMs - CANCELLATION_CUTOFF_HOURS * 3600e3 > now;
  return { ...p, status, startMs, endMs, cancellable };
}

export async function listMyBookings() {
  await wait(150);
  reload();
  seedDemoHistory();
  const now = Date.now();
  const all = Object.values(memory).filter((p) => p && p.booking).map((p) => view(p, now)).filter(Boolean);
  const byStart = (a, b) => a.startMs - b.startMs;
  return {
    upcoming: all.filter((p) => p.status === 'confirmed' || p.status === 'pending_payment').sort(byStart),
    past: all.filter((p) => p.status === 'completed' || p.status === 'no_show').sort((a, b) => b.startMs - a.startMs),
    cancelled: all.filter((p) => p.status.startsWith('cancelled')).sort((a, b) => b.startMs - a.startMs),
  };
}

/** Player cancellation: allowed until 2 h before start; full refund to the same wallet. */
export async function cancelBooking(ref) {
  await wait(400);
  reload();
  const p = memory[ref];
  const v = p && view(p, Date.now());
  if (!v?.cancellable) throw new Error(`Annulation impossible à moins de ${CANCELLATION_CUTOFF_HOURS} h du début.`);
  Object.assign(p, {
    status: 'cancelled_by_client',
    cancelledAt: Date.now(),
    refund: { amount: p.booking.payNow, status: 'succeeded' },
  });
  commit();
  return { refund: p.refund, method: p.method };
}

/* ───────────── Owner side (PATCH /owner/bookings/:id/cancel | no-show) ───────────── */

/** Owner cancels a player's paid booking: full refund to the player's wallet (PRD O11). */
export function ownerCancelPayment(ref, reason) {
  reload();
  const p = memory[ref];
  if (!p || p.status !== 'succeeded') throw new Error('Réservation introuvable ou déjà annulée');
  Object.assign(p, {
    status: 'cancelled_by_owner',
    cancelReason: reason,
    cancelledAt: Date.now(),
    refund: { amount: p.booking.payNow, status: 'succeeded' },
  });
  commit();
}

export function ownerNoShowPayment(ref) {
  reload();
  const p = memory[ref];
  if (!p || p.status !== 'succeeded') throw new Error('Réservation introuvable');
  p.status = 'no_show';
  commit();
}
