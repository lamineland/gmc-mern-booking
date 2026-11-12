/**
 * Venue data for the player screens, from the API (PRD v2.2 §8 "Public"). API objects are
 * normalised to the shapes the screens use: `id`, and areas with `length`/`width` in metres.
 * The pricing and size helpers mirror server/src/domain (the server stays the source of truth
 * for prices; these only drive previews and labels).
 */
import { api } from '../api.js';

export const SPORTS = {
  football: { label: 'Football', short: 'Foot' },
  futsal: { label: 'Futsal', short: 'Futsal' },
  basketball: { label: 'Basketball', short: 'Basket' },
  padel: { label: 'Padel', short: 'Padel' },
};

export const AMENITIES = {
  vestiaires: 'Vestiaires',
  douches: 'Douches',
  parking: 'Parking',
  buvette: 'Buvette',
  wifi: 'Wi-Fi',
  location: 'Location de ballons',
};

export const CITIES = ['Dakar', 'Thiès', 'Saly'];

/**
 * Size categories per sport. Limits come from the server (`GET /meta`, admin-editable) and are
 * merged in by loadMeta(); the hints are UI copy.
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

/** Platform settings the screens show (hold time, cancellation rule). Updated by loadMeta(). */
export const META = { holdMinutes: 10, cancellationCutoffHours: 2, paymentMethods: ['wave', 'orange_money', 'free_money'] };

let metaPromise = null;
export function loadMeta() {
  metaPromise ??= api('/meta')
    .then((m) => {
      Object.assign(META, { holdMinutes: m.holdMinutes, cancellationCutoffHours: m.cancellationCutoffHours, paymentMethods: m.paymentMethods });
      for (const [sport, list] of Object.entries(m.sizeCategories ?? {})) {
        const hints = Object.fromEntries((SIZES[sport] ?? []).map((s) => [s.key, s.hint]));
        SIZES[sport] = list.map((s) => ({ ...s, maxM2: s.maxM2 ?? Infinity, hint: hints[s.key] ?? '' }));
      }
      return META;
    })
    .catch((err) => {
      metaPromise = null;
      throw err;
    });
  return metaPromise;
}

export const surfaceOf = (area) => area.length * area.width;
/** Size category from the dimensions, so editing dimensions updates the badge right away. */
export const sizeOf = (area) => {
  const list = SIZES[area.sport] ?? [{ key: 'standard', label: 'Standard', maxM2: Infinity, hint: '' }];
  return list.find((s) => surfaceOf(area) < s.maxM2) ?? list[list.length - 1];
};
const nf = (n) => new Intl.NumberFormat('fr-FR').format(n).replace(/ | /g, ' ');
export const dimsLabel = (area) => `${area.length} × ${area.width} m · ${nf(surfaceOf(area))} m²`;

/** Price list for an area: its own override, else the venue's list for its sport + size. */
export function pricingOf(venue, area) {
  if (area.pricing) return area.pricing;
  const size = sizeOf(area).key;
  return venue.pricing?.find((x) => x.sport === area.sport && x.size === size) ?? area.priceList ?? null;
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

/** "jeudi 12 novembre" for any ISO date. */
export const longDate = (iso) => parseIso(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

/** Local date and time of an instant in a venue's timezone: { date: 'YYYY-MM-DD', time: 'HH:MM' }. */
export function localDateTime(isoInstant, timeZone = 'Africa/Dakar') {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(isoInstant))
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** Price of the slot starting at `minute` on weekday `day`: narrowest matching rule, else base price. */
export function slotPrice(pricing, day, minute) {
  const span = (r) => toMin(r.to) - toMin(r.from);
  const matches = pricing.priceRules.filter((r) => r.days.includes(day) && toMin(r.from) <= minute && minute < toMin(r.to));
  if (!matches.length) return pricing.basePrice;
  return matches.sort((a, b) => span(a) - span(b))[0].price;
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

/** API area → screen area. */
export const normalizeArea = (a) => ({
  ...a,
  id: a._id,
  length: a.lengthM,
  width: a.widthM,
  pricing: a.priceList?.custom ? { basePrice: a.priceList.basePrice, priceRules: a.priceList.priceRules } : null,
});
/** API venue (+ areas) → screen venue. */
export const normalizeVenue = (v, areas = []) => ({ ...v, id: v._id, areas: areas.map(normalizeArea) });

const qs = (params) => new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== 0)).toString();

/** Search (PRD P1): GET /venues. */
export async function fetchVenues({ city, district, sport, size, date, time, duration } = {}) {
  const res = await api(`/venues?${qs({ city, district, sport, size, date, time, duration, limit: 50 })}`);
  return res.items.map((it) => ({ ...it, venue: normalizeVenue(it.venue, it.areas), areas: it.areas.map(normalizeArea) }));
}

export async function fetchVenue(id) {
  const res = await api(`/venues/${id}`);
  return normalizeVenue(res.venue, res.areas);
}

/** Slot grid of one area on one date: [{ start, end, time, price, peak, state }] in local minutes. */
export async function fetchAreaDay(areaId, date) {
  const res = await api(`/areas/${areaId}/availability?date=${date}`);
  return res.slots.map((s) => ({ start: toMin(s.start), end: toMin(s.end), time: s.start, price: s.price, peak: s.peak, state: s.state }));
}

/** Districts per city, for the search filter. */
let districtsPromise = null;
export function fetchDistricts() {
  districtsPromise ??= api('/venues/districts').then((r) => r.items).catch((err) => {
    districtsPromise = null;
    throw err;
  });
  return districtsPromise;
}
