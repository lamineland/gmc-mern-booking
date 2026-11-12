/** Venue and area helpers shared by public, owner and admin routes. */
import { Area } from '../models/Area.js';
import { getSettings } from '../models/Settings.js';
import { Venue } from '../models/Venue.js';
import { priceListFor } from '../domain/pricing.js';
import { sizeCategoryOf, sizeLabel } from '../domain/sizes.js';
import { runIsFree } from '../domain/slots.js';
import { fmtMin, localParts, toMin } from '../domain/time.js';
import { areaSlots } from './availability.js';

/** Sets area.sizeCategory from its sport and dimensions, with the admin's current limits. */
export async function deriveSize(area) {
  const { sizeCategories } = await getSettings();
  area.sizeCategory = sizeCategoryOf(area.sport, area.lengthM, area.widthM, sizeCategories);
  return area;
}

/** Keeps venue.sports in sync with its active areas (used by search). */
export async function syncVenueSports(venueId) {
  const sports = await Area.distinct('sport', { venueId, active: true });
  await Venue.updateOne({ _id: venueId }, { sports });
}

const PRIVATE = ['rejectionReason', 'ownerSuspended', 'cityKey', 'commissionRate', 'payoutWallet', '__v'];

/** What players may see of a venue. */
export function publicVenue(venue) {
  const v = venue.toJSON ? venue.toJSON() : { ...venue };
  for (const k of PRIVATE) delete v[k];
  return v;
}

/** Area plus what the UI needs: size label, the price list it uses, and dimensions. */
export function areaView(venue, area, categories) {
  const a = area.toJSON ? area.toJSON() : { ...area };
  delete a.lockVersion;
  const list = priceListFor(venue, area);
  return {
    ...a,
    sizeLabel: sizeLabel(area.sport, area.sizeCategory, categories),
    surfaceM2: area.lengthM * area.widthM,
    priceList: list ? { basePrice: list.basePrice, priceRules: list.priceRules, custom: Boolean(area.pricing?.basePrice != null) } : null,
  };
}

export const visibleVenueFilter = { status: 'approved', ownerSuspended: false };

/**
 * Search (PRD P1). Without `time`, returns the next free start times of the day; with `time`,
 * only venues with an area free at exactly that time for the requested duration.
 */
export async function searchVenues({ city, district, sport, size, date, time, duration, page, limit }) {
  const settings = await getSettings();
  const filter = { ...visibleVenueFilter };
  if (city) filter.cityKey = city.toLowerCase();
  if (district) filter.district = district;
  if (sport) filter.sports = sport;
  const venues = await Venue.find(filter).sort({ name: 1 });
  const areas = await Area.find({
    venueId: { $in: venues.map((v) => v._id) },
    active: true,
    ...(sport ? { sport } : {}),
    ...(size ? { sizeCategory: size } : {}),
  }).sort({ createdAt: 1, _id: 1 });

  const items = [];
  for (const venue of venues) {
    const day = date ?? localParts(new Date(), venue.timezone).date;
    const mine = areas.filter((a) => a.venueId.equals(venue._id) && priceListFor(venue, a));
    if (!mine.length) continue;
    const starts = new Map();
    for (const a of mine) {
      const { slots } = await areaSlots({ venue, area: a, dateStr: day });
      const count = Math.max(a.minSlots, duration ? Math.ceil(duration / a.slotMinutes) : 0);
      if (count > a.maxSlots) continue;
      slots.forEach((s, i) => {
        if (time && s.start < toMin(time)) return;
        const t = fmtMin(s.start);
        if (!starts.has(t) && runIsFree(slots, i, count)) starts.set(t, a.id);
      });
    }
    const free = [...starts.entries()].sort(([x], [y]) => toMin(x) - toMin(y)).map(([t, areaId]) => ({ time: t, areaId }));
    if (time && free[0]?.time !== time) continue;
    items.push({
      venue: publicVenue(venue),
      areas: mine.map((a) => areaView(venue, a, settings.sizeCategories)),
      sports: [...new Set(mine.map((a) => a.sport))],
      fromPrice: Math.min(...mine.map((a) => priceListFor(venue, a).basePrice)),
      nextFree: free.slice(0, 4),
      freeCount: free.length,
      date: day,
    });
  }
  const total = items.length;
  return { items: items.slice((page - 1) * limit, page * limit), total, page, pages: Math.max(1, Math.ceil(total / limit)) };
}
