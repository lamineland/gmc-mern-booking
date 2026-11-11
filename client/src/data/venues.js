/**
 * Venue data access for the new screens. Today it reads mock data and computes slots and
 * prices in the browser, following PRD v2.1 §5.2–5.3. When the backend rewrite lands, the
 * three `fetch*` functions switch to `/venues`, `/venues/:id` and `/areas/:id/availability`
 * and the pages stay the same.
 */
import { SPORTS, VENUES } from './mockVenues.js';
import { KEYS, readJSON } from './store.js';

export { SPORTS };
export { AMENITIES } from './mockVenues.js';
export const CITIES = ['Dakar', 'Thiès', 'Saly'];

/**
 * Size categories per sport, picked from the area's surface (length × width, in m²).
 * Each category is the first whose `maxM2` is above the surface. The venue sets one price
 * list per sport + category, so a bigger area costs more without pricing each area by hand.
 */
export const SIZES = {
  football: [
    { key: 'small', label: 'Petit', maxM2: 1200, hint: 'Foot à 5 · environ 40 × 20 m' },
    { key: 'medium', label: 'Moyen', maxM2: 3500, hint: 'Foot à 7 ou 8 · environ 60 × 40 m' },
    { key: 'large', label: 'Grand', maxM2: Infinity, hint: 'Foot à 11 · environ 100 × 64 m' },
  ],
  futsal: [
    { key: 'small', label: 'Réduit', maxM2: 700, hint: 'Moins de 700 m²' },
    { key: 'standard', label: 'Standard', maxM2: Infinity, hint: 'Environ 40 × 20 m' },
  ],
  basketball: [
    { key: 'half', label: 'Demi-terrain', maxM2: 300, hint: '3 contre 3 · environ 15 × 14 m' },
    { key: 'full', label: 'Terrain complet', maxM2: Infinity, hint: '5 contre 5 · 28 × 15 m' },
  ],
  padel: [{ key: 'standard', label: 'Standard', maxM2: Infinity, hint: '20 × 10 m' }],
};

export const surfaceOf = (area) => area.length * area.width;
export const sizeOf = (area) => SIZES[area.sport].find((s) => surfaceOf(area) < s.maxM2);
export const dimsLabel = (area) => `${area.length} × ${area.width} m · ${new Intl.NumberFormat('fr-FR').format(surfaceOf(area)).replace(/\u202f|\u00a0/g, ' ')} m²`;

/** Price list for an area: its own override, else the venue's list for its sport + size. */
export function pricingOf(venue, area) {
  if (area.pricing) return area.pricing;
  const size = sizeOf(area).key;
  const p = venue.pricing.find((x) => x.sport === area.sport && x.size === size);
  if (!p) throw new Error(`No price for ${area.sport}/${size} at ${venue.id}`);
  return p;
}

export const toMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
export const fmtMin = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export const isoOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parseIso = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const weekdayOf = (iso) => parseIso(iso).getDay();

/** The next `n` days for date strips: "Auj.", "Dem.", then "ven. 14". */
export function nextDays(n = 7, from = new Date()) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    const weekday = d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');
    return {
      iso: isoOf(d),
      top: i === 0 ? 'Auj.' : i === 1 ? 'Dem.' : weekday.charAt(0).toUpperCase() + weekday.slice(1),
      day: d.getDate(),
      long: d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }),
    };
  });
}

/** Price of the slot starting at `minute` on weekday `day`: narrowest matching rule, else base price. */
export function slotPrice(pricing, day, minute) {
  const matches = pricing.priceRules.filter((r) => r.days.includes(day) && toMin(r.from) <= minute && minute < toMin(r.to));
  if (!matches.length) return pricing.basePrice;
  return matches.sort((a, b) => toMin(a.to) - toMin(a.from) - (toMin(b.to) - toMin(b.from)))[0].price;
}

/** Stable pseudo-random number in [0, 1) so mock bookings don't move between renders. */
export function noise(key) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

/** Background demand: generated bookings by whole hour, like real ones. The owner can cancel them. */
export function genTaken(area, iso, hour, cancelled = genCancelled()) {
  const day = weekdayOf(iso);
  const weekend = day === 0 || day === 6;
  const p = hour >= 18 && hour < 22 ? 0.5 : weekend && hour >= 10 ? 0.35 : 0.12;
  return noise(`${area.id}|${iso}|${hour}`) < p && !cancelled.has(`${area.id}|${iso}|${hour}`);
}
const genCancelled = () => new Set(readJSON(KEYS.owner, {}).cancelledGen ?? []);

/**
 * Time ranges [startMin, endMin) taken on an area by real activity: player bookings (paid, or
 * still inside their 10-min payment hold), owner manual bookings and owner time blocks.
 */
export function busyRanges(venue, area, iso, now = Date.now()) {
  const ranges = [];
  for (const p of Object.values(readJSON(KEYS.payments, {}))) {
    const b = p?.booking;
    if (!b || b.areaId !== area.id || b.date !== iso) continue;
    const live = p.status === 'succeeded' || p.status === 'no_show'
      || ((p.status === 'pending' || p.status === 'failed') && now < p.holdExpiresAt);
    if (live) ranges.push([toMin(b.start), toMin(b.start) + b.slotCount * area.slotMinutes]);
  }
  const owner = readJSON(KEYS.owner, {});
  for (const m of owner.manual ?? []) {
    if (m.areaId === area.id && m.date === iso && (m.status === 'confirmed' || m.status === 'no_show')) ranges.push([m.startMin, m.endMin]);
  }
  for (const bl of owner.blocks ?? []) {
    if (bl.venueId === venue.id && bl.date === iso && (!bl.areaId || bl.areaId === area.id)) ranges.push([bl.startMin, bl.endMin]);
  }
  return ranges;
}

/** Every slot of an area on a date: { start, end, time, price, peak, state: free | taken | past }. */
export function areaDay(venue, area, iso, now = new Date()) {
  const day = weekdayOf(iso);
  const intervals = venue.openingHours.find((h) => h.day === day)?.intervals ?? [];
  const today = isoOf(now);
  const nowMin = iso < today ? Infinity : iso === today ? now.getHours() * 60 + now.getMinutes() : -1;
  const pricing = pricingOf(venue, area);
  const busy = busyRanges(venue, area, iso, now.getTime());
  const cancelled = genCancelled();
  const slots = [];
  for (const { open, close } of intervals) {
    for (let m = toMin(open); m + area.slotMinutes <= toMin(close); m += area.slotMinutes) {
      const price = slotPrice(pricing, day, m);
      const taken = genTaken(area, iso, Math.floor(m / 60), cancelled) || busy.some(([a, b]) => a < m + area.slotMinutes && b > m);
      const state = m <= nowMin ? 'past' : taken ? 'taken' : 'free';
      slots.push({ start: m, end: m + area.slotMinutes, time: fmtMin(m), price, peak: price > pricing.basePrice, state });
    }
  }
  return slots;
}

/** Can a booking of `count` slots start at index `i`? (all free and back to back) */
export function runIsFree(slots, i, count) {
  for (let k = 0; k < count; k++) {
    const s = slots[i + k];
    if (!s || s.state !== 'free') return false;
    if (k > 0 && slots[i + k - 1].end !== s.start) return false;
  }
  return true;
}

export const venueSports = (venue) => [...new Set(venue.areas.map((a) => a.sport))];
const minPrice = (venue, areas) => Math.min(...areas.map((a) => pricingOf(venue, a).basePrice));

const delay = (value) => new Promise((resolve) => setTimeout(() => resolve(value), 120));

/**
 * Search (PRD P1). `time` (HH:MM) and `duration` (minutes) are optional; without `time`,
 * the next free start times of the day are returned.
 */
export function fetchVenues({ city, district, sport, size, date, time, duration } = {}) {
  const items = [];
  for (const venue of VENUES) {
    if (city && venue.city !== city) continue;
    if (district && venue.district !== district) continue;
    const areas = venue.areas.filter((a) => a.active && (!sport || a.sport === sport) && (!size || sizeOf(a).key === size));
    if (!areas.length) continue;

    const starts = new Map(); // time -> first area free then
    for (const a of areas) {
      const slots = areaDay(venue, a, date);
      const count = Math.max(a.minSlots, duration ? Math.ceil(duration / a.slotMinutes) : 0);
      if (count > a.maxSlots) continue;
      slots.forEach((s, i) => {
        if (time && s.start < toMin(time)) return;
        if (!starts.has(s.time) && runIsFree(slots, i, count)) starts.set(s.time, a.id);
      });
    }
    const free = [...starts.entries()].sort(([x], [y]) => toMin(x) - toMin(y)).map(([t, areaId]) => ({ time: t, areaId }));
    if (time && free[0]?.time !== time) continue; // must be free at the requested time
    items.push({ venue, areas, sports: venueSports(venue), fromPrice: minPrice(venue, areas), nextFree: free.slice(0, 4), freeCount: free.length });
  }
  return delay(items);
}

export function fetchVenue(id) {
  const venue = VENUES.find((v) => v.id === id);
  return venue ? delay(venue) : Promise.reject(new Error('Complexe introuvable'));
}

export const districtsOf = (city) => [...new Set(VENUES.filter((v) => !city || v.city === city).map((v) => v.district))].sort();
