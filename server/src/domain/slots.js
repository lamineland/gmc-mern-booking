/**
 * Slot grid for one area on one date (PRD v2.2 §5.2). Pure: the caller passes the busy
 * ranges (bookings, live holds, time blocks, linked areas) in minutes of that local day.
 */
import { slotPrice } from './pricing.js';
import { openingIntervals, toMin, weekdayOf } from './time.js';

/**
 * @param venue    { timezone, openingHours, exceptions }
 * @param area     { slotMinutes }
 * @param list     price list ({ basePrice, priceRules })
 * @param dateStr  YYYY-MM-DD in the venue's timezone
 * @param busy     [[startMin, endMin), …]
 * @param nowMin   minutes since local midnight of `dateStr` (Infinity for past days, -1 for future days)
 */
export function daySlots({ venue, area, list, dateStr, busy = [], nowMin = -1 }) {
  const weekday = weekdayOf(dateStr, venue.timezone);
  const slots = [];
  for (const { open, close } of openingIntervals(venue, dateStr)) {
    for (let m = toMin(open); m + area.slotMinutes <= toMin(close); m += area.slotMinutes) {
      const end = m + area.slotMinutes;
      const price = slotPrice(list, weekday, m);
      const taken = busy.some(([a, b]) => a < end && b > m);
      slots.push({ start: m, end, price, peak: price > list.basePrice, state: m <= nowMin ? 'past' : taken ? 'taken' : 'free' });
    }
  }
  return slots;
}

/** Can `count` slots starting at index `i` be booked? (all free and back to back) */
export function runIsFree(slots, i, count) {
  for (let k = 0; k < count; k++) {
    const s = slots[i + k];
    if (!s || s.state !== 'free') return false;
    if (k > 0 && slots[i + k - 1].end !== s.start) return false;
  }
  return true;
}
