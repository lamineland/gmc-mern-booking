import { Router } from 'express';
import multer from 'multer';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { config } from '../config.js';
import { Booking } from '../models/Booking.js';
import { Business } from '../models/Business.js';
import { RentalArea } from '../models/RentalArea.js';
import { Service } from '../models/Service.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { notifier } from '../services/notifier.js';
import { storage } from '../services/storage.js';
import { AppError, notFound } from '../utils/AppError.js';
import { areaBody, businessBody, objectId, serviceBody } from '../utils/schemas.js';

const router = Router();
router.use(authenticate, requireRole('owner'));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxImageBytes, files: 1 },
  fileFilter: (req, file, cb) =>
    ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)
      ? cb(null, true)
      : cb(new AppError(400, 'INVALID_FILE_TYPE', 'Only JPEG, PNG or WebP images are allowed')),
});

async function ownBusiness(req) {
  const business = await Business.findOne({ _id: req.params.businessId, ownerId: req.user._id });
  if (!business) throw notFound('Business');
  return business;
}

// ---- Businesses ----------------------------------------------------------------------

router.get('/businesses', async (req, res) => {
  const businesses = await Business.find({ ownerId: req.user._id }).sort({ createdAt: 1 });
  res.json({ businesses });
});

router.post('/businesses', validate(businessBody), async (req, res) => {
  const business = await Business.create({ ...req.valid.body, ownerId: req.user._id, status: 'pending' });
  res.status(201).json({ business });
});

router.get('/businesses/:businessId', async (req, res) => {
  const business = await ownBusiness(req);
  const [services, rentalAreas] = await Promise.all([
    Service.find({ businessId: business._id }).sort({ name: 1 }),
    RentalArea.find({ businessId: business._id }).sort({ name: 1 }),
  ]);
  res.json({ business, services, rentalAreas });
});

const REVIEWED_FIELDS = ['name', 'category', 'city'];

router.put('/businesses/:businessId', validate(businessBody.partial()), async (req, res) => {
  const business = await ownBusiness(req);
  const changes = req.valid.body;
  const needsReview = REVIEWED_FIELDS.some((f) => changes[f] !== undefined && changes[f] !== business[f]);

  business.set(changes);
  // Changing key fields of an approved business sends it back to review; a rejected
  // business goes back to review on any edit.
  if ((business.status === 'approved' && needsReview) || business.status === 'rejected') {
    business.status = 'pending';
    business.rejectionReason = undefined;
  }
  await business.save();
  res.json({ business });
});

router.post('/businesses/:businessId/photos', upload.single('photo'), async (req, res) => {
  const business = await ownBusiness(req);
  if (!req.file) throw new AppError(400, 'NO_FILE', 'Send an image in the "photo" field');
  if (business.photoIds.length >= config.maxPhotosPerBusiness) {
    throw new AppError(400, 'TOO_MANY_PHOTOS', `A business can have at most ${config.maxPhotosPerBusiness} photos`);
  }
  const imageId = await storage.save({ buffer: req.file.buffer, contentType: req.file.mimetype, ownerId: req.user._id });
  business.photoIds.push(imageId);
  await business.save();
  res.status(201).json({ imageId, photoIds: business.photoIds });
});

router.delete('/businesses/:businessId/photos/:imageId', async (req, res) => {
  const business = await ownBusiness(req);
  const before = business.photoIds.length;
  business.photoIds = business.photoIds.filter((id) => !id.equals(req.params.imageId));
  if (business.photoIds.length === before) throw notFound('Photo');
  await business.save();
  await storage.remove(req.params.imageId);
  res.status(204).end();
});

// ---- Services & rental areas ------------------------------------------------------------

function crud(path, Model, schema) {
  router.post(`/businesses/:businessId/${path}`, validate(schema), async (req, res) => {
    const business = await ownBusiness(req);
    const doc = await Model.create({ ...req.valid.body, businessId: business._id });
    res.status(201).json(doc);
  });

  router.put(`/businesses/:businessId/${path}/:itemId`, validate(schema.partial()), async (req, res) => {
    const business = await ownBusiness(req);
    const doc = await Model.findOneAndUpdate({ _id: req.params.itemId, businessId: business._id }, req.valid.body, {
      new: true,
      runValidators: true,
    });
    if (!doc) throw notFound();
    res.json(doc);
  });

  // Soft delete: past bookings keep a reference to it.
  router.delete(`/businesses/:businessId/${path}/:itemId`, async (req, res) => {
    const business = await ownBusiness(req);
    const doc = await Model.findOneAndUpdate({ _id: req.params.itemId, businessId: business._id }, { active: false });
    if (!doc) throw notFound();
    res.status(204).end();
  });
}
crud('services', Service, serviceBody);
crud('areas', RentalArea, areaBody);

// ---- Bookings ---------------------------------------------------------------------------

const bookingsQuery = z.object({
  businessId: objectId.optional(),
  range: z.enum(['today', 'week']).default('today'),
});

router.get('/bookings', validate(bookingsQuery, 'query'), async (req, res) => {
  const { businessId, range } = req.valid.query;
  const businesses = await Business.find({ ownerId: req.user._id }).select('_id timezone');
  const selected = businessId ? businesses.filter((b) => b._id.equals(businessId)) : businesses;
  if (businessId && selected.length === 0) throw notFound('Business');

  const tz = businessId ? selected[0].timezone : config.defaultTimezone;
  const now = DateTime.now().setZone(tz);
  const from = range === 'week' ? now.startOf('week') : now.startOf('day');
  const to = range === 'week' ? from.plus({ weeks: 1 }) : from.plus({ days: 1 });

  const bookings = await Booking.find({
    businessId: { $in: selected.map((b) => b._id) },
    startAt: { $gte: from.toJSDate(), $lt: to.toJSDate() },
  })
    .sort({ startAt: 1 })
    .populate('clientId', 'name phone')
    .populate('businessId', 'name timezone')
    .populate('rentalAreaId', 'name');

  const counts = bookings.reduce((acc, b) => ({ ...acc, [b.displayStatus]: (acc[b.displayStatus] || 0) + 1 }), {});
  res.json({ range, from: from.toISO(), to: to.toISO(), timezone: tz, counts, bookings });
});

router.patch(
  '/bookings/:id/cancel',
  validate(z.object({ reason: z.string().trim().min(3, 'Please give a reason').max(300) })),
  async (req, res) => {
    const booking = await Booking.findById(req.params.id);
    if (!booking || !(await Business.exists({ _id: booking.businessId, ownerId: req.user._id }))) throw notFound('Booking');
    if (booking.status !== 'confirmed' || booking.startAt <= new Date()) {
      throw new AppError(409, 'NOT_CANCELLABLE', 'Only upcoming confirmed bookings can be cancelled');
    }
    Object.assign(booking, { status: 'cancelled_by_owner', cancelledAt: new Date(), cancelReason: req.valid.body.reason });
    await booking.save();
    notifier.bookingCancelled(booking._id);
    res.json({ booking });
  },
);

export default router;
