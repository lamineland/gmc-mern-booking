/**
 * Mock of the owner API (PRD v2.2 §4.3, §8): day calendar, manual bookings, time blocks,
 * cancellation and no-show. Shares occupancy with the player side through store.js, so a block
 * or phone booking made here shows as "Réservé" to players, and a player's paid booking shows here.
 * When the backend lands: fetchDay → GET /owner/calendar, the rest → /owner/bookings, /owner/time-blocks.
 */
import { VENUES, applyVenueEdits } from './mockVenues.js';
import { ownerCancelPayment, ownerNoShowPayment } from './payments.js';
import { KEYS, readJSON, writeJSON } from './store.js';
import { SIZES, areaDay, fmtMin, genTaken, isoOf, noise, pricingOf, runIsFree, sizeOf, slotPrice, toMin, weekdayOf } from './venues.js';

/** The demo owner (owner@demo.test) runs these venues. */
export const OWNER_VENUE_IDS = ['almadies-five', 'sacre-coeur-arena', 'ouakam-sports'];

const NAMES = ['Moussa Diop', 'Awa Ndiaye', 'Cheikh Fall', 'Fatou Sarr', 'Ibrahima Sow', 'Mamadou Ba', 'Aïssatou Diallo',
  'Ousmane Gueye', 'Khady Faye', 'Pape Seck', 'Abdoulaye Mbaye', 'Ndeye Thiam', 'Lamine Cissé', 'Babacar Ndour'];
const TEAMS = ['ASC Ouakam vétérans', 'Les potes du jeudi', 'Team Sonatel', 'Dakar Ballers', '', '', '', ''];

const load = () => ({ manual: [], blocks: [], cancelledGen: [], noShowGen: [], ...readJSON(KEYS.owner, {}) });
const save = (db) => writeJSON(KEYS.owner, db);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (list, key) => list[Math.floor(noise(key) * list.length)];
const phoneFor = (key) => `+221 7${pick(['7', '8', '6', '0'], `${key}op`)} ${String(Math.floor(noise(`${key}ph`) * 900) + 100)} ${String(Math.floor(noise(`${key}p2`) * 90) + 10)} ${String(Math.floor(noise(`${key}p3`) * 90) + 10)}`;

export const fetchOwnerVenues = () => wait(80).then(() => VENUES.filter((v) => OWNER_VENUE_IDS.includes(v.id)));

const priceOf = (venue, area, iso, startMin, endMin) => {
  const pricing = pricingOf(venue, area);
  let sum = 0;
  for (let m = startMin; m < endMin; m += area.slotMinutes) sum += slotPrice(pricing, weekdayOf(iso), m);
  return sum;
};

/** Online payments: full price, or the venue's deposit with the rest due on site. */
const onlineSplit = (venue, price) => {
  const paidOnline = venue.paymentMode === 'deposit' ? Math.min(venue.depositAmount, price) : price;
  return { paidOnline, atVenue: price - paidOnline };
};

/** Everything happening on one venue on one day, ready to draw. */
export async function fetchDay(venueId, iso) {
  await wait(120);
  const venue = VENUES.find((v) => v.id === venueId);
  const db = load();
  const payments = readJSON(KEYS.payments, {});
  const now = Date.now();
  const nowDate = new Date(now);
  const nowMin = iso < isoOf(nowDate) ? Infinity : iso === isoOf(nowDate) ? nowDate.getHours() * 60 + nowDate.getMinutes() : -1;
  const intervals = venue.openingHours.find((h) => h.day === weekdayOf(iso))?.intervals ?? [];
  const dayStart = Math.min(...intervals.map((i) => toMin(i.open)), 24 * 60);
  const dayEnd = Math.max(...intervals.map((i) => toMin(i.close)), 0);
  const cancelledGen = new Set(db.cancelledGen);
  const noShowGen = new Set(db.noShowGen);
  const events = [];

  for (const area of venue.areas) {
    // 1. Background demand, grouped by hour (generated with the same rules the player side uses).
    const hours = new Map();
    for (const { open, close } of intervals) {
      for (let m = toMin(open); m + area.slotMinutes <= toMin(close); m += area.slotMinutes) {
        const h = Math.floor(m / 60);
        if (!genTaken(area, iso, h, cancelledGen)) continue;
        const r = hours.get(h) ?? [m, m];
        r[1] = m + area.slotMinutes;
        hours.set(h, r);
      }
    }
    for (const [h, [startMin, endMin]] of hours) {
      const key = `${area.id}|${iso}|${h}`;
      const online = noise(`${key}src`) < 0.7;
      const price = priceOf(venue, area, iso, startMin, endMin);
      const split = online ? onlineSplit(venue, price) : { paidOnline: 0, atVenue: price };
      events.push({
        id: `gen:${key}`, kind: 'booking', areaId: area.id, startMin, endMin,
        source: online ? 'online' : 'manual', clientName: pick(NAMES, `${key}n`), phone: phoneFor(key),
        team: online ? pick(TEAMS, `${key}t`) : '', code: `WP-${Math.floor(noise(`${key}c`) * 46655).toString(36).toUpperCase().padStart(3, 'X')}`,
        price, ...split, status: noShowGen.has(key) ? 'no_show' : 'confirmed',
      });
    }

    // 2. Player bookings made through WinPitch (this browser session).
    for (const p of Object.values(payments)) {
      const b = p?.booking;
      if (!b || b.areaId !== area.id || b.date !== iso) continue;
      const pending = (p.status === 'pending' || p.status === 'failed') && now < p.holdExpiresAt;
      if (!pending && p.status !== 'succeeded' && p.status !== 'no_show') continue;
      const startMin = toMin(b.start);
      events.push({
        id: `pay:${p.ref}`, kind: 'booking', areaId: area.id, startMin, endMin: startMin + b.slotCount * area.slotMinutes,
        source: 'online', clientName: p.clientName ?? 'Joueur WinPitch', phone: p.phone, team: p.note, code: p.code,
        price: b.price, paidOnline: pending ? 0 : b.payNow, atVenue: pending ? b.price : b.atVenue,
        status: pending ? 'pending_payment' : p.status === 'no_show' ? 'no_show' : 'confirmed',
        holdExpiresAt: p.holdExpiresAt, method: p.method,
      });
    }

    // 3. Manual (phone / walk-in) bookings entered by the owner.
    for (const m of db.manual) {
      if (m.areaId !== area.id || m.date !== iso || !['confirmed', 'no_show'].includes(m.status)) continue;
      events.push({ ...m, id: `man:${m.id}`, kind: 'booking', source: 'manual', paidOnline: 0, atVenue: m.price });
    }
  }

  // 4. Time blocks (one per area, or the whole venue when areaId is null).
  for (const bl of db.blocks) {
    if (bl.venueId !== venueId || bl.date !== iso) continue;
    for (const area of venue.areas) {
      if (!bl.areaId || bl.areaId === area.id) {
        events.push({ id: `blk:${bl.id}:${area.id}`, blockId: bl.id, kind: 'block', areaId: area.id, startMin: bl.startMin, endMin: bl.endMin, reason: bl.reason, wholeVenue: !bl.areaId });
      }
    }
  }

  for (const e of events) {
    e.past = e.endMin <= nowMin;
    e.started = e.startMin <= nowMin;
    e.time = `${fmtMin(e.startMin)} – ${fmtMin(e.endMin)}`;
  }

  // Day numbers (PRD O7): confirmed bookings only; blocks and payments in progress don't count.
  const counted = events.filter((e) => e.kind === 'booking' && e.status === 'confirmed');
  const openMinutes = venue.areas.length * intervals.reduce((s, i) => s + toMin(i.close) - toMin(i.open), 0);
  const bookedMinutes = counted.reduce((s, e) => s + e.endMin - e.startMin, 0);
  const stats = {
    bookings: counted.length,
    online: counted.filter((e) => e.source === 'online').length,
    bookedMinutes,
    occupancy: openMinutes ? bookedMinutes / openMinutes : 0,
    revenue: counted.reduce((s, e) => s + e.price, 0),
    paidOnline: counted.reduce((s, e) => s + e.paidOnline, 0),
    atVenue: counted.reduce((s, e) => s + e.atVenue, 0),
  };

  return { venue, iso, dayStart, dayEnd, intervals, events, stats, nowMin };
}

/** Free start times for a manual booking or block form. */
export function freeStarts(venue, area, iso) {
  const slots = areaDay(venue, area, iso);
  return slots.map((s, i) => ({ ...s, i })).filter((s) => s.state === 'free');
}

export function quoteManual(venue, area, iso, startMin, slotCount) {
  return priceOf(venue, area, iso, startMin, startMin + slotCount * area.slotMinutes);
}

/** POST /owner/bookings: same double-booking check as player bookings (PRD O8). */
export async function createManualBooking({ venueId, areaId, date, startMin, slotCount, clientName, phone, price, note }) {
  await wait(250);
  const venue = VENUES.find((v) => v.id === venueId);
  const area = venue.areas.find((a) => a.id === areaId);
  const slots = areaDay(venue, area, date);
  const i = slots.findIndex((s) => s.start === startMin);
  if (i < 0 || !runIsFree(slots, i, slotCount)) throw new Error('Ce créneau n’est plus libre. Choisis une autre heure.');
  const db = load();
  const id = `${Date.now().toString(36)}`;
  db.manual.push({
    id, venueId, areaId, date, startMin, endMin: startMin + slotCount * area.slotMinutes,
    clientName: clientName.trim(), phone: phone.trim(), team: note?.trim() ?? '', price: Number(price),
    code: `WP-M${id.slice(-3).toUpperCase()}`, status: 'confirmed', createdAt: Date.now(),
  });
  save(db);
  return id;
}

/** POST /owner/time-blocks: refused when it overlaps an active booking (PRD O10). */
export async function createBlock({ venueId, areaId, date, startMin, endMin, reason }) {
  await wait(250);
  const venue = VENUES.find((v) => v.id === venueId);
  if (endMin <= startMin) throw new Error('L’heure de fin doit être après l’heure de début.');
  const day = await fetchDay(venueId, date);
  const clash = day.events.find((e) => e.kind === 'booking' && ['confirmed', 'pending_payment'].includes(e.status)
    && (!areaId || e.areaId === areaId) && e.startMin < endMin && e.endMin > startMin);
  if (clash) {
    const area = venue.areas.find((a) => a.id === clash.areaId);
    throw new Error(`${area.name} est réservé de ${clash.time} (${clash.clientName}). Annule d’abord cette réservation ou choisis d’autres heures.`);
  }
  const db = load();
  db.blocks.push({ id: Date.now().toString(36), venueId, areaId: areaId || null, date, startMin, endMin, reason: reason.trim() });
  save(db);
}

export async function deleteBlock(blockId) {
  await wait(150);
  const db = load();
  db.blocks = db.blocks.filter((b) => b.id !== blockId);
  save(db);
}

/** PATCH /owner/bookings/:id/cancel: reason required; online payments are refunded in full. */
export async function cancelEvent(event, reason) {
  await wait(300);
  if (!reason?.trim()) throw new Error('Indique la raison de l’annulation : le joueur la verra.');
  const [kind, ...rest] = event.id.split(':');
  const id = rest.join(':');
  const db = load();
  if (kind === 'gen') db.cancelledGen.push(id);
  if (kind === 'man') Object.assign(db.manual.find((m) => m.id === id), { status: 'cancelled_by_owner', cancelReason: reason.trim() });
  if (kind === 'pay') ownerCancelPayment(id, reason.trim());
  save(db);
}

/** PATCH /owner/bookings/:id/no-show: only once the booking has started (PRD O12). */
export async function markNoShow(event) {
  await wait(200);
  const [kind, ...rest] = event.id.split(':');
  const id = rest.join(':');
  const db = load();
  if (kind === 'gen') db.noShowGen.push(id);
  if (kind === 'man') db.manual.find((m) => m.id === id).status = 'no_show';
  if (kind === 'pay') ownerNoShowPayment(id);
  save(db);
}

/* ───────────── Pricing setup (PUT /owner/venues/:id/pricing, PUT /owner/areas/:id/pricing) ───────────── */

const clone = (x) => JSON.parse(JSON.stringify(x));
export const sameSpan = (r) => toMin(r.to) - toMin(r.from);

/** Editable copy of a venue's pricing: price lists per sport + size, and each area's dimensions/override. */
export function pricingDraft(venue) {
  return clone({
    pricing: venue.pricing,
    areas: venue.areas.map((a) => ({ id: a.id, length: a.length, width: a.width, pricing: a.pricing ?? null })),
  });
}

/** Area as it would be with the draft's dimensions (for size categories and previews). */
export const draftArea = (venue, draft, areaId) => ({ ...venue.areas.find((a) => a.id === areaId), ...draft.areas.find((a) => a.id === areaId) });

/** Blocking errors: the server would refuse to save these (PRD §5.3, O5). */
export function pricingErrors(venue, draft) {
  const errors = [];
  const check = (list, label) => {
    if (!(list.basePrice > 0)) errors.push(`${label} : le prix heures creuses doit être supérieur à 0.`);
    list.priceRules.forEach((r, i) => {
      if (!r.days.length) errors.push(`${label}, période ${i + 1} : choisis au moins un jour.`);
      if (toMin(r.to) <= toMin(r.from)) errors.push(`${label}, période ${i + 1} : l’heure de fin doit être après l’heure de début.`);
      if (!(r.price > 0)) errors.push(`${label}, période ${i + 1} : indique un prix.`);
      list.priceRules.slice(i + 1).forEach((o, k) => {
        const overlap = r.days.some((d) => o.days.includes(d)) && toMin(r.from) < toMin(o.to) && toMin(o.from) < toMin(r.to);
        if (overlap && sameSpan(r) === sameSpan(o)) {
          errors.push(`${label} : les périodes ${i + 1} et ${i + k + 2} se chevauchent avec la même durée, impossible de savoir laquelle appliquer.`);
        }
      });
    });
  };
  for (const a of draft.areas) {
    const area = draftArea(venue, draft, a.id);
    if (!(a.length >= 5 && a.width >= 5 && a.length <= 150 && a.width <= 100)) errors.push(`${area.name} : dimensions entre 5 et 150 m de long, 5 et 100 m de large.`);
    else if (a.pricing) check(a.pricing, `${area.name} (tarif personnalisé)`);
    else if (!draft.pricing.some((p) => p.sport === area.sport && p.size === sizeOf(area).key)) {
      errors.push(`${area.name} est maintenant « ${sizeOf(area).label} » : crée la grille de prix ${sizeOf(area).label} ou garde ses anciennes dimensions.`);
    }
  }
  for (const p of draft.pricing) check(p, `${SIZES[p.sport].find((z) => z.key === p.size).label}`);
  return errors;
}

/** Non-blocking warnings: a bigger size priced below a smaller one (PRD O5). */
export function pricingWarnings(draft) {
  const warnings = [];
  const max = (p) => Math.max(p.basePrice, ...p.priceRules.map((r) => r.price));
  for (const sport of new Set(draft.pricing.map((p) => p.sport))) {
    const lists = draft.pricing.filter((p) => p.sport === sport)
      .sort((x, y) => SIZES[sport].findIndex((z) => z.key === x.size) - SIZES[sport].findIndex((z) => z.key === y.size));
    for (let i = 1; i < lists.length; i++) {
      const small = SIZES[sport].find((z) => z.key === lists[i - 1].size).label;
      const big = SIZES[sport].find((z) => z.key === lists[i].size).label;
      if (lists[i].basePrice < lists[i - 1].basePrice) warnings.push(`En heures creuses, « ${big} » (${lists[i].basePrice}) coûte moins cher que « ${small} » (${lists[i - 1].basePrice}).`);
      if (max(lists[i]) < max(lists[i - 1])) warnings.push(`Au plus cher, « ${big} » coûte moins que « ${small} ».`);
    }
  }
  return warnings.map((w) => w.replace(/\((\d+)\)/g, (_, n) => `(${new Intl.NumberFormat('fr-FR').format(n).replace(/\u202f|\u00a0/g, ' ')} FCFA)`));
}

export async function saveVenuePricing(venueId, draft) {
  await wait(300);
  const venue = VENUES.find((v) => v.id === venueId);
  const errors = pricingErrors(venue, draft);
  if (errors.length) throw new Error(errors[0]);
  // Drop price lists no area uses any more, so the venue page only lists real prices.
  const used = new Set(draft.areas.filter((a) => !a.pricing).map((a) => {
    const area = draftArea(venue, draft, a.id);
    return `${area.sport}|${sizeOf(area).key}`;
  }));
  const clean = { ...clone(draft), pricing: draft.pricing.filter((p) => used.has(`${p.sport}|${p.size}`)) };
  const db = load();
  db.venueEdits = { ...(db.venueEdits ?? {}), [venueId]: clean };
  save(db);
  applyVenueEdits();
  return clean;
}
