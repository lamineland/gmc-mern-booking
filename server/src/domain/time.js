import { DateTime } from 'luxon';

/** "18:30" → 1110. "24:00" is allowed as the end of the day. */
export const toMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** 1110 → "18:30", 1440 → "24:00". */
export const fmtMin = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Start of a calendar date (YYYY-MM-DD) in a timezone. */
export const dayStart = (dateStr, tz) => DateTime.fromISO(dateStr, { zone: tz }).startOf('day');

/** 0 = Sunday … 6 = Saturday, like Date.getDay() and the opening-hours data. */
export const weekdayOf = (dateStr, tz) => dayStart(dateStr, tz).weekday % 7;

/** Minutes since local midnight → JS Date. */
export const atMinute = (dateStr, tz, min) => dayStart(dateStr, tz).plus({ minutes: min }).toJSDate();

/** JS Date → { date: 'YYYY-MM-DD', min } in a timezone. */
export function localParts(date, tz) {
  const dt = DateTime.fromJSDate(date).setZone(tz);
  return { date: dt.toISODate(), min: dt.hour * 60 + dt.minute };
}

/** Opening intervals for a date, honouring exceptions (holidays, closures). */
export function openingIntervals(venue, dateStr) {
  const exception = venue.exceptions?.find((e) => e.date === dateStr);
  if (exception) return exception.closed ? [] : exception.intervals;
  const day = weekdayOf(dateStr, venue.timezone);
  return venue.openingHours.find((h) => h.day === day)?.intervals ?? [];
}
