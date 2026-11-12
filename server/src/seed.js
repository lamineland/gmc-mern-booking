/**
 * Development data for Dakar (PRD v2.2 §6.4): admin, owners, players, 10 venues with areas and
 * prices per size, and about 4 weeks of bookings in every status with payments, ledger and a payout.
 *
 *   npm run seed            → creates the admin and the demo data if the database has no venues
 *   npm run seed -- --reset → wipes the WinPitch collections first (never in production)
 *
 * Demo password for every seeded account except the admin: password123.
 */
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDb } from './db.js';
import { Area } from './models/Area.js';
import { Booking } from './models/Booking.js';
import { LedgerEntry } from './models/LedgerEntry.js';
import { Payment } from './models/Payment.js';
import { Payout } from './models/Payout.js';
import { Settings, getSettings } from './models/Settings.js';
import { TimeBlock } from './models/TimeBlock.js';
import { User } from './models/User.js';
import { Venue } from './models/Venue.js';
import { bookingAmounts, priceListFor, quoteSlots } from './domain/pricing.js';
import { sizeCategoryOf } from './domain/sizes.js';
import { atMinute, localParts, openingIntervals, toMin, weekdayOf } from './domain/time.js';
import { bookingCode } from './utils/codes.js';

const DEMO_PASSWORD = 'password123'; // demo accounts only
const TZ = 'Africa/Dakar';
const isProd = process.env.NODE_ENV === 'production';
const reset = process.argv.includes('--reset');

// Deterministic randomness, so every reset gives the same demo.
let seedState = 20261111;
const rand = () => {
  seedState = (seedState + 0x6d2b79f5) | 0;
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (list) => list[Math.floor(rand() * list.length)];

await connectDb();

if (reset) {
  if (isProd) throw new Error('--reset is not allowed in production');
  const names = (await mongoose.connection.db.listCollections().toArray()).map((c) => c.name);
  // Includes the pre-v2 collections (businesses, services, rentalareas) the rewrite replaced.
  for (const c of ['users', 'venues', 'areas', 'bookings', 'payments', 'ledgerentries', 'payouts', 'timeblocks', 'settings', 'images', 'businesses', 'services', 'rentalareas']) {
    if (names.includes(c)) await mongoose.connection.db.dropCollection(c);
  }
  await Promise.all([User, Venue, Area, Booking, Payment, LedgerEntry, Payout, TimeBlock, Settings].map((m) => m.syncIndexes()));
  console.log('WinPitch collections reset.');
}

const settings = await getSettings();
const hash = await bcrypt.hash(DEMO_PASSWORD, 10);

async function upsertUser({ phone, password, ...rest }) {
  const existing = await User.findOne({ phone });
  if (existing) return existing;
  return User.create({ phone, ...rest, passwordHash: password ? await bcrypt.hash(password, 12) : hash });
}

if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  await upsertUser({ name: 'Admin WinPitch', phone: process.env.ADMIN_PHONE || '+221770000000', email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD, role: 'admin' });
  console.log(`Admin: ${process.env.ADMIN_EMAIL}`);
} else {
  console.warn('ADMIN_EMAIL / ADMIN_PASSWORD not set: no admin created');
}

if (isProd) {
  await mongoose.disconnect();
  process.exit(0);
}
if (await Venue.exists({})) {
  console.log('Demo data already present. Use `npm run seed -- --reset` to start over.');
  await mongoose.disconnect();
  process.exit(0);
}

// ---- Accounts ---------------------------------------------------------------------------

const owners = [
  await upsertUser({ name: 'Demo Owner', phone: '+221770000001', email: 'owner@demo.test', role: 'owner' }),
  await upsertUser({ name: 'Ibrahima Sow', phone: '+221770000003', email: 'ibrahima@demo.test', role: 'owner' }),
  await upsertUser({ name: 'Aïssatou Diallo', phone: '+221770000004', email: 'aissatou@demo.test', role: 'owner' }),
];
const demoClient = await upsertUser({ name: 'Demo Client', phone: '+221770000002', email: 'client@demo.test', role: 'client' });
const PLAYER_NAMES = ['Moussa Diop', 'Awa Ndiaye', 'Cheikh Fall', 'Fatou Sarr', 'Mamadou Ba', 'Ousmane Gueye', 'Khady Faye', 'Pape Seck', 'Abdoulaye Mbaye', 'Ndeye Thiam'];
const players = [demoClient];
for (const [i, name] of PLAYER_NAMES.entries()) {
  players.push(await upsertUser({ name, phone: `+2217700000${10 + i}`, role: 'client' }));
}
const GUESTS = [['Lamine Cissé', '+221781234501'], ['Babacar Ndour', '+221761234502'], ['Serigne Mbaye', '+221771234503'], ['Coumba Sy', '+221701234504']];

// ---- Venues & areas (same data as the front-end mock, client/src/data/mockVenues.js) ------

const WEEK = [0, 1, 2, 3, 4, 5, 6];
const hours = (open, close) => WEEK.map((day) => ({ day, intervals: [{ open, close }] }));
const price = (sport, size, basePrice, peak, weekend = peak) => ({
  sport, size, basePrice,
  priceRules: [
    { days: [1, 2, 3, 4, 5], from: '18:00', to: '24:00', price: peak },
    { days: [0, 6], from: '08:00', to: '24:00', price: weekend },
  ],
});
const area = (name, sport, format, surface, lengthM, widthM, maxPlayers, extra = {}) => ({ name, sport, format, surface, lengthM, widthM, maxPlayers, ...extra });

const VENUES = [
  {
    owner: 0, name: 'Almadies Five', city: 'Dakar', district: 'Almadies', address: 'Route des Almadies, en face du King Fahd', phone: '+221 77 000 00 01',
    description: 'Deux terrains de foot à 5 et un terrain de foot à 7, synthétiques et éclairés, à deux pas de la corniche.',
    amenities: ['vestiaires', 'douches', 'parking', 'buvette', 'location'], openingHours: hours('08:00', '24:00'), paymentMode: 'full',
    location: [-17.5136, 14.7453],
    pricing: [price('football', 'small', 15000, 20000, 22500), price('football', 'medium', 25000, 35000)],
    areas: [
      area('Terrain 1', 'football', 'Foot à 5', 'Gazon synthétique', 40, 20, 10),
      area('Terrain 2', 'football', 'Foot à 5', 'Gazon synthétique', 40, 20, 10),
      area('Grand terrain', 'football', 'Foot à 7', 'Gazon synthétique', 60, 40, 14, { minSlots: 2 }),
    ],
  },
  {
    owner: 0, name: 'Ouakam Sports Center', city: 'Dakar', district: 'Ouakam', address: 'Cité Avion, rue OKM-120', phone: '+221 77 000 00 02',
    description: 'Salle couverte avec parquet : terrain de basket complet, demi-terrain pour le 3x3, et un futsal.',
    amenities: ['vestiaires', 'douches', 'parking', 'wifi'], openingHours: hours('07:00', '23:00'), paymentMode: 'deposit', depositAmount: 5000,
    location: [-17.4893, 14.7239],
    pricing: [price('basketball', 'full', 10000, 15000), price('basketball', 'half', 6000, 9000), price('futsal', 'standard', 12000, 18000)],
    areas: [
      area('Terrain de basket', 'basketball', '5 contre 5', 'Parquet', 28, 15, 10, { indoor: true }),
      area('Demi-terrain', 'basketball', '3 contre 3', 'Parquet', 15, 14, 6, { indoor: true }),
      area('Futsal', 'futsal', 'Futsal', 'Sol synthétique', 40, 20, 10, { indoor: true }),
    ],
  },
  {
    owner: 1, name: 'Mermoz Padel Club', city: 'Dakar', district: 'Mermoz', address: 'VDN, après la station Total', phone: '+221 77 000 00 03',
    description: 'Deux courts de padel vitrés, raquettes en location. Idéal en fin de journée.',
    amenities: ['vestiaires', 'parking', 'buvette', 'location'], openingHours: hours('08:00', '23:00'), paymentMode: 'deposit', depositAmount: 5000,
    pricing: [price('padel', 'standard', 12000, 16000)],
    areas: [
      area('Court 1', 'padel', 'Double', 'Gazon synthétique', 20, 10, 4, { minSlots: 2, maxSlots: 4 }),
      area('Court 2', 'padel', 'Double', 'Gazon synthétique', 20, 10, 4, { minSlots: 2, maxSlots: 4 }),
    ],
  },
  {
    owner: 0, name: 'Sacré-Cœur Arena', city: 'Dakar', district: 'Sacré-Cœur', address: 'Sacré-Cœur 3, près de la pharmacie Keur Gorgui', phone: '+221 77 000 00 04',
    description: 'Le seul grand terrain de foot à 11 du quartier, avec un terrain à 7 et un petit terrain à 5. Tribune et éclairage LED.',
    amenities: ['vestiaires', 'douches', 'buvette'], openingHours: hours('09:00', '24:00'), paymentMode: 'full',
    pricing: [price('football', 'small', 15000, 20000), price('football', 'medium', 25000, 40000), price('football', 'large', 45000, 65000)],
    areas: [
      area('Terrain principal', 'football', 'Foot à 11', 'Gazon synthétique', 100, 64, 22, { minSlots: 2 }),
      area('Terrain à 7', 'football', 'Foot à 7', 'Gazon synthétique', 60, 40, 14, { minSlots: 2 }),
      area('Petit terrain', 'football', 'Foot à 5', 'Gazon synthétique', 42, 22, 10),
    ],
  },
  {
    owner: 1, name: 'Parcelles Foot Park', city: 'Dakar', district: 'Parcelles Assainies', address: 'Unité 15, à côté du terminus', phone: '+221 77 000 00 05',
    description: 'Deux terrains de foot à 5 aux meilleurs prix de Dakar.', commissionRate: 0.08,
    amenities: ['vestiaires', 'parking'], openingHours: hours('08:00', '24:00'), paymentMode: 'deposit', depositAmount: 5000,
    pricing: [price('football', 'small', 10000, 15000)],
    areas: [
      area('Terrain A', 'football', 'Foot à 5', 'Gazon synthétique', 38, 19, 10),
      area('Terrain B', 'football', 'Foot à 5', 'Gazon synthétique', 38, 19, 10),
    ],
  },
  {
    owner: 1, name: 'Grand Yoff Hoops', city: 'Dakar', district: 'Grand Yoff', address: 'Route de l’aéroport, Arafat', phone: '+221 77 000 00 06',
    description: 'Terrains de basket en plein air, éclairés jusqu’à 23 h.',
    amenities: ['parking', 'buvette'], openingHours: hours('07:00', '23:00'), paymentMode: 'full',
    pricing: [price('basketball', 'full', 10000, 15000), price('basketball', 'half', 6000, 9000)],
    areas: [
      area('Terrain 5x5', 'basketball', '5 contre 5', 'Résine', 28, 15, 10),
      area('Terrain 3x3', 'basketball', '3 contre 3', 'Résine', 15, 11, 6),
    ],
  },
  {
    owner: 2, name: 'Thiès Arena', city: 'Thiès', district: 'Médina Fall', address: 'Avenue Caen, Médina Fall', phone: '+221 77 000 00 07',
    description: 'Le complexe de foot à 5 de référence à Thiès.',
    amenities: ['vestiaires', 'douches', 'parking'], openingHours: hours('09:00', '24:00'), paymentMode: 'full',
    pricing: [price('football', 'small', 10000, 14000)],
    areas: [area('Terrain 1', 'football', 'Foot à 5', 'Gazon synthétique', 40, 20, 10)],
  },
  {
    owner: 2, name: 'Saly Beach Padel', city: 'Saly', district: 'Saly Portudal', address: 'Route des hôtels, Saly Portudal', phone: '+221 77 000 00 08',
    description: 'Padel face à la mer, courts couverts pour jouer même en plein soleil.',
    amenities: ['vestiaires', 'douches', 'parking', 'buvette', 'location', 'wifi'], openingHours: hours('08:00', '22:00'), paymentMode: 'deposit', depositAmount: 5000,
    pricing: [price('padel', 'standard', 15000, 20000)],
    areas: [area('Court Océan', 'padel', 'Double', 'Gazon synthétique', 20, 10, 4, { indoor: true, minSlots: 2, maxSlots: 4 })],
  },
  {
    owner: 2, status: 'pending', name: 'Pikine Five', city: 'Dakar', district: 'Pikine', address: 'Rue 10, Pikine Icotaf', phone: '+221 77 000 00 09',
    description: 'Nouveau complexe en attente de validation.', amenities: ['parking'], openingHours: hours('09:00', '23:00'), paymentMode: 'full',
    pricing: [price('football', 'small', 9000, 13000)],
    areas: [area('Terrain 1', 'football', 'Foot à 5', 'Gazon synthétique', 36, 18, 10)],
  },
  {
    owner: 1, status: 'rejected', rejectionReason: 'Photos manquantes et adresse incomplète.', name: 'Yoff Beach Soccer', city: 'Dakar', district: 'Yoff', address: 'Plage de Yoff',
    description: 'Beach soccer.', amenities: [], openingHours: hours('10:00', '20:00'), paymentMode: 'full',
    pricing: [price('football', 'small', 8000, 10000)],
    areas: [area('Plage', 'football', 'Beach soccer', 'Sable', 35, 26, 10)],
  },
];

const created = [];
for (const v of VENUES) {
  const { owner, areas, location, ...data } = v;
  const venue = await Venue.create({
    ...data, ownerId: owners[owner]._id, status: data.status ?? 'approved', timezone: TZ,
    location: location ? { type: 'Point', coordinates: location } : undefined,
    sports: [...new Set(areas.map((a) => a.sport))],
    payoutWallet: { method: 'wave', phone: owners[owner].phone },
  });
  const docs = await Area.create(areas.map((a) => ({ ...a, venueId: venue._id, sizeCategory: sizeCategoryOf(a.sport, a.lengthM, a.widthM, settings.sizeCategories) })));
  created.push({ venue, areas: docs });
}

// ---- Bookings, payments, ledger ---------------------------------------------------------

const today = localParts(new Date(), TZ).date;
const shift = (iso, days) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + days * 86400e3).toISOString().slice(0, 10);
const METHODS = ['wave', 'wave', 'orange_money', 'free_money'];
const TEAMS = ['ASC Ouakam vétérans', 'Les potes du jeudi', 'Team Sonatel', 'Dakar Ballers'];
const usedCodes = new Set();
const code = () => {
  let c;
  do c = bookingCode(); while (usedCodes.has(c));
  usedCodes.add(c);
  return c;
};

const bookings = [];
const payments = [];
const ledger = [];
const nowMs = Date.now();

for (const { venue, areas } of created.filter((c) => c.venue.status === 'approved')) {
  for (let d = -14; d <= 13; d++) {
    const date = shift(today, d);
    const weekday = weekdayOf(date, TZ);
    const weekend = weekday === 0 || weekday === 6;
    for (const a of areas) {
      const list = priceListFor(venue, a);
      for (const { open, close } of openingIntervals(venue, date)) {
        for (let m = toMin(open); m + 60 <= toMin(close); m += 60) {
          const h = m / 60;
          const p = h >= 18 && h < 22 ? 0.5 : weekend && h >= 10 ? 0.35 : 0.12;
          if (rand() >= p * (d > 7 ? 0.5 : 1)) continue; // fewer bookings far ahead
          const slotCount = Math.max(a.minSlots, 60 / a.slotMinutes);
          const startAt = atMinute(date, TZ, m);
          const endAt = atMinute(date, TZ, m + slotCount * a.slotMinutes);
          if (endAt > atMinute(date, TZ, toMin(close))) continue;
          const q = quoteSlots(list, weekday, m, slotCount, a.slotMinutes);
          const online = rand() < 0.7;
          const player = pick(players);
          const guest = pick(GUESTS);
          const past = endAt.getTime() < nowMs;
          const r = rand();
          const status = past && r < 0.05 ? 'no_show' : r < 0.1 ? 'cancelled_by_client' : r < 0.13 ? 'cancelled_by_owner' : 'confirmed';
          if (!past && status === 'no_show') continue;
          const createdAt = new Date(startAt.getTime() - (1 + Math.floor(rand() * 5)) * 86400e3);
          const amounts = online
            ? bookingAmounts({ price: q.price, paymentMode: venue.paymentMode, depositAmount: venue.depositAmount, commissionRate: venue.commissionRate ?? settings.commissionRate })
            : { commissionRate: 0, commission: 0, amountDueOnline: 0, amountDueAtVenue: q.price, ownerNet: 0 };
          const _id = new mongoose.Types.ObjectId();
          bookings.push({
            _id, code: code(), venueId: venue._id, areaId: a._id,
            clientId: online ? player._id : null, guest: online ? undefined : { name: guest[0], phone: guest[1] },
            source: online ? 'online' : 'manual', startAt, endAt, slotCount, price: q.price, currency: 'XOF',
            priceBreakdown: q.breakdown.map((b) => ({ startAt: atMinute(date, TZ, b.min), price: b.price })),
            areaSnapshot: { name: a.name, format: a.format, sport: a.sport, sizeCategory: a.sizeCategory, lengthM: a.lengthM, widthM: a.widthM },
            paymentMode: online ? venue.paymentMode : 'on_site', ...amounts,
            note: online && rand() < 0.3 ? pick(TEAMS) : undefined,
            status,
            cancelReason: status === 'cancelled_by_owner' ? pick(['Terrain impraticable après la pluie.', 'Coupure de courant, pas d’éclairage.', 'Tournoi privé ajouté.']) : undefined,
            cancelledAt: status.startsWith('cancelled') ? new Date(createdAt.getTime() + 3600e3) : undefined,
            createdBy: online ? player._id : venue.ownerId,
            createdAt, updatedAt: createdAt,
          });
          if (!online) continue;
          const method = pick(METHODS);
          const chargeId = new mongoose.Types.ObjectId();
          payments.push({
            _id: chargeId, bookingId: _id, venueId: venue._id, clientId: player._id, kind: 'charge', provider: 'mock', method, phone: player.phone,
            amount: amounts.amountDueOnline, status: 'succeeded', providerRef: `seed_${chargeId}`, createdAt, updatedAt: createdAt,
          });
          ledger.push(
            { venueId: venue._id, bookingId: _id, paymentId: chargeId, type: 'booking_income', amount: amounts.amountDueOnline, createdAt },
            { venueId: venue._id, bookingId: _id, paymentId: chargeId, type: 'commission', amount: -amounts.commission, createdAt },
          );
          if (status.startsWith('cancelled')) {
            const refundId = new mongoose.Types.ObjectId();
            const at = new Date(createdAt.getTime() + 3600e3);
            payments.push({
              _id: refundId, bookingId: _id, venueId: venue._id, clientId: player._id, kind: 'refund', provider: 'mock', method, phone: player.phone,
              amount: amounts.amountDueOnline, status: 'succeeded', providerRef: `seedrf_${refundId}`, reason: 'Annulation', createdAt: at, updatedAt: at,
            });
            ledger.push(
              { venueId: venue._id, bookingId: _id, paymentId: refundId, type: 'refund', amount: -amounts.amountDueOnline, createdAt: at },
              { venueId: venue._id, bookingId: _id, paymentId: refundId, type: 'commission_reversal', amount: amounts.commission, createdAt: at },
            );
          }
        }
      }
    }
  }
}

// One refund that failed, for the admin "retry refund" screen (amount ends in 13 → the mock refuses it).
const failedRefundBooking = bookings.find((b) => b.source === 'online' && b.status === 'confirmed' && b.startAt.getTime() > nowMs + 86400e3);
if (failedRefundBooking) {
  Object.assign(failedRefundBooking, { status: 'cancelled_by_owner', cancelReason: 'Fuite d’eau dans les vestiaires.', cancelledAt: new Date() });
  const charge = payments.find((p) => p.bookingId.equals(failedRefundBooking._id));
  payments.push({
    bookingId: failedRefundBooking._id, venueId: failedRefundBooking.venueId, clientId: failedRefundBooking.clientId, kind: 'refund', provider: 'mock',
    method: charge.method, phone: charge.phone, amount: charge.amount, status: 'refund_failed', reason: 'Annulation par le complexe',
    failureReason: 'Remboursement refusé par l’opérateur.', providerRef: `seedrf_failed_${failedRefundBooking._id}`,
  });
}

await Booking.insertMany(bookings);
await Payment.insertMany(payments);
await LedgerEntry.insertMany(ledger);

// A time block and a payout on the demo owner's first venue.
const almadies = created[0];
await TimeBlock.create({
  venueId: almadies.venue._id, areaId: almadies.areas[2]._id, reason: 'Entretien du gazon',
  startAt: atMinute(shift(today, 2), TZ, toMin('09:00')), endAt: atMinute(shift(today, 2), TZ, toMin('12:00')), createdBy: owners[0]._id,
});
const balance = ledger.filter((l) => l.venueId.equals(almadies.venue._id) && l.createdAt < new Date(nowMs - 7 * 86400e3)).reduce((s, l) => s + l.amount, 0);
if (balance > 0) {
  const admin = await User.findOne({ role: 'admin' });
  const payout = await Payout.create({
    venueId: almadies.venue._id, amount: balance, method: 'wave', reference: 'WAVE-DEMO-0001',
    paidAt: new Date(nowMs - 6 * 86400e3), recordedBy: (admin ?? owners[0])._id, note: 'Versement hebdomadaire',
  });
  await LedgerEntry.create({ venueId: almadies.venue._id, payoutId: payout._id, type: 'payout', amount: -balance, createdAt: payout.paidAt });
}

const count = (s) => bookings.filter((b) => b.status === s).length;
console.log(`Seeded ${created.length} venues, ${created.reduce((s, c) => s + c.areas.length, 0)} areas, ${bookings.length} bookings `
  + `(${count('confirmed')} confirmed, ${count('no_show')} no-show, ${count('cancelled_by_client') + count('cancelled_by_owner')} cancelled), ${payments.length} payments.`);
console.log(`Demo accounts (password "${DEMO_PASSWORD}"): owner@demo.test / 77 000 00 01, client@demo.test / 77 000 00 02`);
await mongoose.disconnect();
