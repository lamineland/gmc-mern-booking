/**
 * Pricing and commission rules (PRD v2.2 §5.3, §5.4). Pure functions, no database.
 */
import { DEFAULT_SIZE_CATEGORIES, sizeLabel, sizeRank } from './sizes.js';
import { toMin } from './time.js';

const span = (r) => toMin(r.to) - toMin(r.from);

/** Price list for an area: its own override, else the venue's list for its sport + size. */
export function priceListFor(venue, area) {
  if (area.pricing?.basePrice != null) return area.pricing;
  return venue.pricing?.find((p) => p.sport === area.sport && p.size === area.sizeCategory) ?? null;
}

/** Price of the slot starting at `minute` on `weekday`: narrowest matching rule wins, else base price. */
export function slotPrice(list, weekday, minute) {
  let best = null;
  for (const r of list.priceRules ?? []) {
    if (!r.days.includes(weekday) || minute < toMin(r.from) || minute >= toMin(r.to)) continue;
    if (!best || span(r) < span(best)) best = r;
  }
  return best ? best.price : list.basePrice;
}

/** Per-slot prices and total for `count` slots starting at `startMin`. */
export function quoteSlots(list, weekday, startMin, count, slotMinutes) {
  const breakdown = [];
  for (let k = 0; k < count; k++) {
    const m = startMin + k * slotMinutes;
    breakdown.push({ min: m, price: slotPrice(list, weekday, m) });
  }
  return { breakdown, price: breakdown.reduce((s, b) => s + b.price, 0) };
}

/** Errors that make a price list unsaveable. `label` prefixes each message. */
export function priceListErrors(list, label) {
  const errors = [];
  if (!(list.basePrice > 0)) errors.push(`${label} : le prix heures creuses doit être supérieur à 0.`);
  (list.priceRules ?? []).forEach((r, i) => {
    if (!r.days?.length) errors.push(`${label}, période ${i + 1} : choisis au moins un jour.`);
    if (toMin(r.to) <= toMin(r.from)) errors.push(`${label}, période ${i + 1} : l’heure de fin doit être après l’heure de début.`);
    if (!(r.price > 0)) errors.push(`${label}, période ${i + 1} : indique un prix.`);
    list.priceRules.slice(i + 1).forEach((o, k) => {
      const overlap = r.days.some((d) => o.days.includes(d)) && toMin(r.from) < toMin(o.to) && toMin(o.from) < toMin(r.to);
      if (overlap && span(r) === span(o)) {
        errors.push(`${label} : les périodes ${i + 1} et ${i + k + 2} se chevauchent avec la même durée.`);
      }
    });
  });
  return errors;
}

/** Warnings (not errors): a bigger size priced below a smaller one, per sport. */
export function sizeOrderWarnings(pricing, categories = DEFAULT_SIZE_CATEGORIES) {
  const warnings = [];
  const max = (p) => Math.max(p.basePrice, ...(p.priceRules ?? []).map((r) => r.price));
  for (const sport of new Set(pricing.map((p) => p.sport))) {
    const lists = pricing.filter((p) => p.sport === sport).sort((a, b) => sizeRank(sport, a.size, categories) - sizeRank(sport, b.size, categories));
    for (let i = 1; i < lists.length; i++) {
      const [small, big] = [lists[i - 1], lists[i]];
      const names = `« ${sizeLabel(sport, big.size, categories)} » / « ${sizeLabel(sport, small.size, categories)} »`;
      if (big.basePrice < small.basePrice) warnings.push({ code: 'BIGGER_CHEAPER_OFF_PEAK', sport, message: `${names} : la grande taille est moins chère en heures creuses.` });
      if (max(big) < max(small)) warnings.push({ code: 'BIGGER_CHEAPER_PEAK', sport, message: `${names} : la grande taille est moins chère au plus cher.` });
    }
  }
  return warnings;
}

/**
 * Amounts saved on an online booking (PRD §5.4):
 * commission = clamp(round(price × rate), min, max); deposit ≥ commission; ownerNet = paid online − commission.
 */
export function bookingAmounts({ price, paymentMode, depositAmount, commissionRate, commissionMin, commissionMax }) {
  let commission = Math.round(price * commissionRate);
  if (commissionMin != null) commission = Math.max(commission, commissionMin);
  if (commissionMax != null) commission = Math.min(commission, commissionMax);
  commission = Math.min(commission, price);
  const amountDueOnline = paymentMode === 'deposit' ? Math.min(price, Math.max(depositAmount ?? 0, commission)) : price;
  return {
    commissionRate,
    commission,
    amountDueOnline,
    amountDueAtVenue: price - amountDueOnline,
    ownerNet: amountDueOnline - commission,
  };
}
