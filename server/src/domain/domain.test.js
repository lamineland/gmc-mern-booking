import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { bookingAmounts, priceListErrors, priceListFor, quoteSlots, sizeOrderWarnings, slotPrice } from './pricing.js';
import { sizeCategoryOf } from './sizes.js';
import { daySlots, runIsFree } from './slots.js';
import { atMinute, localParts, openingIntervals, weekdayOf } from './time.js';

const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKEND = [0, 6];
const list = {
  basePrice: 15000,
  priceRules: [
    { days: WEEKDAYS, from: '18:00', to: '24:00', price: 20000 },
    { days: WEEKEND, from: '08:00', to: '24:00', price: 22500 },
  ],
};
const venue = {
  timezone: 'Africa/Dakar',
  openingHours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, intervals: [{ open: '08:00', close: '24:00' }] })),
  exceptions: [{ date: '2026-11-17', closed: true, intervals: [] }],
};
const area = { slotMinutes: 30 };
const THURSDAY = '2026-11-12';
const SATURDAY = '2026-11-14';

describe('sizes', () => {
  it('derives the football size from the surface', () => {
    assert.equal(sizeCategoryOf('football', 40, 20), 'small'); // 800 m²
    assert.equal(sizeCategoryOf('football', 60, 40), 'medium'); // 2 400 m²
    assert.equal(sizeCategoryOf('football', 100, 64), 'large'); // 6 400 m²
  });
  it('uses the limit as an exclusive upper bound', () => {
    assert.equal(sizeCategoryOf('football', 40, 30), 'medium'); // exactly 1 200 m²
  });
  it('handles basketball half and full courts', () => {
    assert.equal(sizeCategoryOf('basketball', 15, 14), 'half');
    assert.equal(sizeCategoryOf('basketball', 28, 15), 'full');
  });
  it('falls back to the "other" list for sports without categories', () => {
    assert.equal(sizeCategoryOf('cricket', 50, 50), 'standard');
  });
});

describe('pricing', () => {
  it('uses the base price off-peak and the rule price in its band', () => {
    assert.equal(slotPrice(list, 4, toMinutes('17:30')), 15000);
    assert.equal(slotPrice(list, 4, toMinutes('18:00')), 20000);
    assert.equal(slotPrice(list, 6, toMinutes('10:00')), 22500);
  });
  it('lets the narrowest rule win when rules overlap', () => {
    const withHappyHour = { ...list, priceRules: [...list.priceRules, { days: [4], from: '20:00', to: '21:00', price: 12000 }] };
    assert.equal(slotPrice(withHappyHour, 4, toMinutes('20:30')), 12000);
    assert.equal(slotPrice(withHappyHour, 4, toMinutes('21:00')), 20000);
  });
  it('sums slots that cross from off-peak to peak', () => {
    const q = quoteSlots(list, 4, toMinutes('17:00'), 3, 30);
    assert.deepEqual(q.breakdown.map((b) => b.price), [15000, 15000, 20000]);
    assert.equal(q.price, 50000);
  });
  it('picks the area override before the venue size list', () => {
    const v = { pricing: [{ sport: 'football', size: 'small', ...list }] };
    assert.equal(priceListFor(v, { sport: 'football', sizeCategory: 'small' }).basePrice, 15000);
    assert.equal(priceListFor(v, { sport: 'football', sizeCategory: 'small', pricing: { basePrice: 9000, priceRules: [] } }).basePrice, 9000);
    assert.equal(priceListFor(v, { sport: 'football', sizeCategory: 'large' }), null);
  });
  it('refuses invalid price lists', () => {
    assert.deepEqual(priceListErrors(list, 'Petit'), []);
    const bad = {
      basePrice: 0,
      priceRules: [
        { days: [], from: '18:00', to: '17:00', price: 0 },
        { days: [1], from: '10:00', to: '12:00', price: 1 },
        { days: [1], from: '11:00', to: '13:00', price: 2 },
      ],
    };
    const errors = priceListErrors(bad, 'X');
    assert.equal(errors.length, 5); // base, days, end<start, price, same-span overlap
  });
  it('warns when a bigger size is cheaper', () => {
    const pricing = [
      { sport: 'football', size: 'small', basePrice: 15000, priceRules: [] },
      { sport: 'football', size: 'medium', basePrice: 12000, priceRules: [] },
    ];
    assert.equal(sizeOrderWarnings(pricing).length, 2);
    pricing[1].basePrice = 25000;
    assert.equal(sizeOrderWarnings(pricing).length, 0);
  });
});

describe('commission and amounts', () => {
  it('takes the full price online by default', () => {
    assert.deepEqual(bookingAmounts({ price: 40000, paymentMode: 'full', commissionRate: 0.1 }), {
      commissionRate: 0.1, commission: 4000, amountDueOnline: 40000, amountDueAtVenue: 0, ownerNet: 36000,
    });
  });
  it('takes a deposit online and the rest at the venue', () => {
    const a = bookingAmounts({ price: 40000, paymentMode: 'deposit', depositAmount: 5000, commissionRate: 0.1 });
    assert.equal(a.amountDueOnline, 5000);
    assert.equal(a.amountDueAtVenue, 35000);
    assert.equal(a.ownerNet, 1000);
  });
  it('never takes a deposit below the commission', () => {
    const a = bookingAmounts({ price: 80000, paymentMode: 'deposit', depositAmount: 5000, commissionRate: 0.1 });
    assert.equal(a.commission, 8000);
    assert.equal(a.amountDueOnline, 8000);
    assert.equal(a.ownerNet, 0);
  });
  it('applies the commission min and max', () => {
    assert.equal(bookingAmounts({ price: 10000, paymentMode: 'full', commissionRate: 0.1, commissionMin: 1500 }).commission, 1500);
    assert.equal(bookingAmounts({ price: 200000, paymentMode: 'full', commissionRate: 0.1, commissionMax: 10000 }).commission, 10000);
  });
});

describe('slots', () => {
  it('builds 30-minute slots over the opening hours with prices', () => {
    const slots = daySlots({ venue, area, list, dateStr: THURSDAY });
    assert.equal(slots.length, 32); // 08:00 → 24:00
    assert.equal(slots[0].price, 15000);
    assert.equal(slots.find((s) => s.start === toMinutes('18:00')).peak, true);
  });
  it('marks busy ranges as taken and past slots as past', () => {
    const slots = daySlots({ venue, area, list, dateStr: THURSDAY, busy: [[toMinutes('19:00'), toMinutes('20:00')]], nowMin: toMinutes('09:10') });
    const state = (t) => slots.find((s) => s.start === toMinutes(t)).state;
    assert.equal(state('09:00'), 'past');
    assert.equal(state('09:30'), 'free');
    assert.equal(state('19:00'), 'taken');
    assert.equal(state('19:30'), 'taken');
    assert.equal(state('20:00'), 'free');
  });
  it('closes the day on an exception', () => {
    assert.deepEqual(openingIntervals(venue, '2026-11-17'), []);
    assert.equal(daySlots({ venue, area, list, dateStr: '2026-11-17' }).length, 0);
  });
  it('only accepts free back-to-back runs', () => {
    const slots = daySlots({ venue, area, list, dateStr: THURSDAY, busy: [[toMinutes('19:00'), toMinutes('19:30')]] });
    const i = slots.findIndex((s) => s.start === toMinutes('18:00'));
    assert.equal(runIsFree(slots, i, 2), true);
    assert.equal(runIsFree(slots, i, 3), false);
    assert.equal(runIsFree(slots, slots.length - 1, 2), false); // runs past closing
  });
});

describe('time', () => {
  it('knows Dakar weekdays and converts local minutes', () => {
    assert.equal(weekdayOf(THURSDAY, 'Africa/Dakar'), 4);
    assert.equal(weekdayOf(SATURDAY, 'Africa/Dakar'), 6);
    const d = atMinute(THURSDAY, 'Africa/Dakar', toMinutes('18:30'));
    assert.equal(d.toISOString(), '2026-11-12T18:30:00.000Z'); // Dakar is UTC+0
    assert.deepEqual(localParts(d, 'Africa/Dakar'), { date: THURSDAY, min: 1110 });
  });
});

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
