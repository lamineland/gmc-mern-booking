/**
 * Owner data from the API (PRD v2.2 §4.3, §8 "Owner"): venues, day calendar, manual bookings,
 * time blocks, cancel / no-show, and pricing per size. The pricing checks below mirror the
 * server's so the page can show errors while typing; the server checks again on save.
 */
import { api } from '../api.js';
import { SIZES, fmtMin, normalizeVenue, pricingOf, sizeOf, slotPrice, toMin, weekdayOf } from './venues.js';

export async function fetchOwnerVenues() {
  const { venues } = await api('/owner/venues');
  return venues.map((v) => normalizeVenue(v));
}

export async function fetchOwnerVenue(id) {
  const res = await api(`/owner/venues/${id}`);
  return normalizeVenue(res.venue, res.areas);
}

/** Everything on one venue on one day (GET /owner/calendar), ready to draw. */
export async function fetchDay(venueId, iso) {
  const [day, venue] = await Promise.all([api(`/owner/calendar?venueId=${venueId}&date=${iso}`), fetchOwnerVenue(venueId)]);
  return { ...day, iso, venue };
}

/** Free start times of an area on a date, for the manual booking form. */
export async function fetchFreeStarts(areaId, iso) {
  const res = await api(`/areas/${areaId}/availability?date=${iso}`);
  return res.slots.filter((s) => s.state === 'free').map((s) => ({ start: toMin(s.start), time: s.start }));
}

/** Suggested price of a manual booking (the area's normal price). */
export function quoteManual(venue, area, iso, startMin, slotCount) {
  const list = pricingOf(venue, area);
  if (!list) return 0;
  let sum = 0;
  for (let k = 0; k < slotCount; k++) sum += slotPrice(list, weekdayOf(iso), startMin + k * area.slotMinutes);
  return sum;
}

/** POST /owner/bookings: same double-booking check as player bookings (PRD O8). */
export async function createManualBooking({ areaId, date, startMin, slotCount, clientName, phone, price, note }) {
  const { booking } = await api('/owner/bookings', {
    method: 'POST',
    body: { areaId, date, start: fmtMin(startMin), slotCount, guestName: clientName, guestPhone: phone, price: Number(price), note: note || undefined },
  });
  return booking;
}

/** POST /owner/time-blocks: refused when it overlaps an active booking (PRD O10). */
export async function createBlock({ venueId, areaId, date, startMin, endMin, reason }) {
  const to = endMin >= 1440 ? '24:00' : fmtMin(endMin);
  await api('/owner/time-blocks', { method: 'POST', body: { venueId, areaId: areaId || null, date, from: fmtMin(startMin), to, reason } });
}

export const deleteBlock = (blockId) => api(`/owner/time-blocks/${blockId}`, { method: 'DELETE' });

/** PATCH /owner/bookings/:id/cancel: reason required; online payments are refunded in full. */
export async function cancelEvent(event, reason) {
  if (!reason?.trim()) throw new Error('Indique la raison de l’annulation : le joueur la verra.');
  return api(`/owner/bookings/${event.id}/cancel`, { method: 'PATCH', body: { reason: reason.trim() } });
}

/** PATCH /owner/bookings/:id/no-show: only once the booking has started (PRD O12). */
export const markNoShow = (event) => api(`/owner/bookings/${event.id}/no-show`, { method: 'PATCH' });

/* ───────────── Pricing setup (PUT /owner/venues/:id/pricing) ───────────── */

const clone = (x) => JSON.parse(JSON.stringify(x));
export const sameSpan = (r) => toMin(r.to) - toMin(r.from);
const cleanList = (l) => ({ basePrice: l.basePrice, priceRules: l.priceRules.map(({ days, from, to, price }) => ({ days, from, to, price })) });

/** Editable copy of a venue's pricing: price lists per sport + size, and each area's dimensions/override. */
export function pricingDraft(venue) {
  return clone({
    pricing: venue.pricing.map((p) => ({ sport: p.sport, size: p.size, ...cleanList(p) })),
    areas: venue.areas.map((a) => ({ id: a.id, length: a.length, width: a.width, pricing: a.pricing ? cleanList(a.pricing) : null })),
  });
}

/** Area as it would be with the draft's dimensions (for size categories and previews). */
export const draftArea = (venue, draft, areaId) => ({ ...venue.areas.find((a) => a.id === areaId), ...draft.areas.find((a) => a.id === areaId) });

/** Blocking errors: the server refuses to save these (PRD §5.3, O5). */
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
  for (const p of draft.pricing) check(p, `${SIZES[p.sport]?.find((z) => z.key === p.size)?.label ?? p.size}`);
  return errors;
}

/** Non-blocking warnings: a bigger size priced below a smaller one (PRD O5). */
export function pricingWarnings(draft) {
  const warnings = [];
  const max = (p) => Math.max(p.basePrice, ...p.priceRules.map((r) => r.price));
  const rank = (sport, key) => (SIZES[sport] ?? []).findIndex((z) => z.key === key);
  const label = (sport, key) => (SIZES[sport] ?? []).find((z) => z.key === key)?.label ?? key;
  for (const sport of new Set(draft.pricing.map((p) => p.sport))) {
    const lists = draft.pricing.filter((p) => p.sport === sport).sort((x, y) => rank(sport, x.size) - rank(sport, y.size));
    for (let i = 1; i < lists.length; i++) {
      const small = label(sport, lists[i - 1].size);
      const big = label(sport, lists[i].size);
      if (lists[i].basePrice < lists[i - 1].basePrice) warnings.push(`En heures creuses, « ${big} » (${lists[i].basePrice}) coûte moins cher que « ${small} » (${lists[i - 1].basePrice}).`);
      if (max(lists[i]) < max(lists[i - 1])) warnings.push(`Au plus cher, « ${big} » coûte moins que « ${small} ».`);
    }
  }
  return warnings.map((w) => w.replace(/\((\d+)\)/g, (_, n) => `(${new Intl.NumberFormat('fr-FR').format(n).replace(/ | /g, ' ')} FCFA)`));
}

/** PUT /owner/venues/:id/pricing. Returns the saved draft (unused size lists are dropped by the server). */
export async function saveVenuePricing(venueId, draft) {
  await api(`/owner/venues/${venueId}/pricing`, {
    method: 'PUT',
    body: {
      pricing: draft.pricing.map((p) => ({ sport: p.sport, size: p.size, ...cleanList(p) })),
      areas: draft.areas.map((a) => ({ id: a.id, lengthM: a.length, widthM: a.width, pricing: a.pricing ? cleanList(a.pricing) : null })),
    },
  });
  return pricingDraft(await fetchOwnerVenue(venueId));
}
