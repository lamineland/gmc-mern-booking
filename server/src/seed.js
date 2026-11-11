// Creates the first admin (from ADMIN_EMAIL / ADMIN_PASSWORD) plus demo data for local
// development. Safe to run more than once.
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDb } from './db.js';
import { Business } from './models/Business.js';
import { RentalArea } from './models/RentalArea.js';
import { Service } from './models/Service.js';
import { User } from './models/User.js';

const DEMO_PASSWORD = 'password123'; // demo accounts only, never in production

async function upsertUser({ email, password, ...rest }) {
  const existing = await User.findOne({ email });
  if (existing) return existing;
  return User.create({ email, ...rest, passwordHash: await bcrypt.hash(password, 12) });
}

const weekdays = (open, close) =>
  [1, 2, 3, 4, 5, 6].map((day) => ({ day, intervals: [{ open, close }] }));

await connectDb();

if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
  await upsertUser({ name: 'Admin', email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD, role: 'admin' });
  console.log(`Admin: ${process.env.ADMIN_EMAIL}`);
} else {
  console.warn('ADMIN_EMAIL / ADMIN_PASSWORD not set: no admin created');
}

if (process.env.NODE_ENV !== 'production') {
  const owner = await upsertUser({ name: 'Demo Owner', email: 'owner@demo.test', password: DEMO_PASSWORD, role: 'owner', phone: '+221700000001' });
  await upsertUser({ name: 'Demo Client', email: 'client@demo.test', password: DEMO_PASSWORD, role: 'client', phone: '+221700000002' });

  if (!(await Business.exists({ ownerId: owner._id }))) {
    const salon = await Business.create({
      ownerId: owner._id,
      name: 'Studio Élégance',
      category: 'salon',
      description: 'Haircuts, beard care and styling.',
      city: 'Dakar',
      address: 'Rue 10, Point E',
      status: 'approved',
      openingHours: [
        ...[1, 2, 3, 4, 5].map((day) => ({ day, intervals: [{ open: '09:00', close: '13:00' }, { open: '14:00', close: '19:00' }] })),
        { day: 6, intervals: [{ open: '09:00', close: '16:00' }] },
      ],
    });
    await Service.create([
      { businessId: salon._id, name: 'Haircut', durationMin: 30, price: 5000 },
      { businessId: salon._id, name: 'Beard trim', durationMin: 15, price: 2000 },
      { businessId: salon._id, name: 'Braids', durationMin: 120, price: 15000 },
    ]);

    const pitch = await Business.create({
      ownerId: owner._id,
      name: 'Five Arena',
      category: 'football',
      description: '5-a-side synthetic pitches.',
      city: 'Dakar',
      address: 'Route de Ouakam',
      status: 'approved',
      slotStepMinutes: 60,
      openingHours: weekdays('10:00', '23:00').concat({ day: 0, intervals: [{ open: '10:00', close: '20:00' }] }),
    });
    await RentalArea.create([
      { businessId: pitch._id, name: 'Pitch A', type: '5-a-side', capacity: 10 },
      { businessId: pitch._id, name: 'Pitch B', type: '5-a-side', capacity: 10 },
    ]);
    await Service.create([
      { businessId: pitch._id, name: '1 hour match', durationMin: 60, price: 20000, usesRentalArea: true },
      { businessId: pitch._id, name: '2 hour match', durationMin: 120, price: 35000, usesRentalArea: true },
    ]);

    await Business.create({
      ownerId: owner._id,
      name: 'Iron Gym',
      category: 'gym',
      city: 'Thiès',
      address: 'Avenue Lamine Gueye',
      status: 'pending',
      openingHours: weekdays('06:00', '22:00'),
    });
  }
  console.log(`Demo accounts (password "${DEMO_PASSWORD}"): owner@demo.test, client@demo.test`);
}

await mongoose.disconnect();
