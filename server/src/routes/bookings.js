import { Router } from 'express';
import mongoose from 'mongoose';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { config } from '../config.js';
import { Booking } from '../models/Booking.js';
import { Business } from '../models/Business.js';
import { RentalArea } from '../models/RentalArea.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { computeSlots, resolveSelection } from '../services/availability.js';
import { notifier } from '../services/notifier.js';
import { AppError, notFound } from '../utils/AppError.js';
import { objectId } from '../utils/schemas.js';

const router = Router();
router.use(authenticate, requireRole('client'));

const createSchema = z.object({
  businessId: objectId,
  serviceIds: z.array(objectId).min(1).max(config.maxServicesPerBooking),
  rentalAreaId: objectId.optional(),
  startAt: z.string().datetime({ offset: true }),
});

router.post('/', validate(createSchema), async (req, res) => {
  const { businessId, serviceIds, rentalAreaId, startAt } = req.valid.body;
  const start = DateTime.fromISO(startAt);
  let booking;

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const sel = await resolveSelection({ businessId, serviceIds, rentalAreaId, session });

      // Write to the resource document first. Two transactions booking the same resource
      // now conflict, so one is retried and then sees the other's booking.
      if (sel.area) await RentalArea.updateOne({ _id: sel.area._id }, { $inc: { lockVersion: 1 } }, { session });
      else await Business.updateOne({ _id: sel.business._id }, { $inc: { lockVersion: 1 } }, { session });

      const slots = await computeSlots({
        business: sel.business,
        durationMin: sel.durationMin,
        rentalAreaId: sel.area?._id,
        dateStr: start.setZone(sel.business.timezone).toISODate(),
        session,
      });
      const slot = slots.find((s) => DateTime.fromISO(s.startAt).toMillis() === start.toMillis());
      if (!slot) throw new AppError(409, 'SLOT_UNAVAILABLE', 'This slot is no longer available');

      [booking] = await Booking.create(
        [
          {
            clientId: req.user._id,
            businessId: sel.business._id,
            rentalAreaId: sel.area?._id ?? null,
            items: sel.services.map((s) => ({ serviceId: s._id, name: s.name, durationMin: s.durationMin, price: s.price })),
            startAt: new Date(slot.startAt),
            endAt: new Date(slot.endAt),
            totalPrice: sel.totalPrice,
            status: 'confirmed',
          },
        ],
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  notifier.bookingCreated(booking._id);
  res.status(201).json({ booking });
});

const listSchema = z.object({ tab: z.enum(['upcoming', 'past', 'cancelled']).default('upcoming') });

router.get('/me', validate(listSchema, 'query'), async (req, res) => {
  const { tab } = req.valid.query;
  const now = new Date();
  const filter = { clientId: req.user._id };
  let sort = { startAt: 1 };
  if (tab === 'upcoming') Object.assign(filter, { status: 'confirmed', endAt: { $gte: now } });
  if (tab === 'past') {
    Object.assign(filter, { status: 'confirmed', endAt: { $lt: now } });
    sort = { startAt: -1 };
  }
  if (tab === 'cancelled') {
    filter.status = { $in: ['cancelled_by_client', 'cancelled_by_owner'] };
    sort = { startAt: -1 };
  }

  const bookings = await Booking.find(filter)
    .sort(sort)
    .limit(100)
    .populate('businessId', 'name city address timezone')
    .populate('rentalAreaId', 'name');
  res.json({ bookings, cancellationCutoffHours: config.cancellationCutoffHours });
});

router.patch('/:id/cancel', validate(z.object({ reason: z.string().trim().max(300).optional() })), async (req, res) => {
  const booking = await Booking.findOne({ _id: req.params.id, clientId: req.user._id });
  if (!booking) throw notFound('Booking');
  if (booking.status !== 'confirmed') throw new AppError(409, 'NOT_CANCELLABLE', 'This booking can no longer be cancelled');

  const cutoff = booking.startAt.getTime() - config.cancellationCutoffHours * 3600 * 1000;
  if (Date.now() > cutoff) {
    throw new AppError(409, 'CUTOFF_PASSED', `Bookings can only be cancelled up to ${config.cancellationCutoffHours} hours before they start`);
  }

  Object.assign(booking, { status: 'cancelled_by_client', cancelledAt: new Date(), cancelReason: req.valid.body.reason });
  await booking.save();
  notifier.bookingCancelled(booking._id);
  res.json({ booking });
});

export default router;
