import { Router } from 'express';
import { z } from 'zod';
import { CATEGORIES } from '../config.js';
import { Business } from '../models/Business.js';
import { RentalArea } from '../models/RentalArea.js';
import { Service } from '../models/Service.js';
import { validate } from '../middleware/validate.js';
import { computeSlots, resolveSelection } from '../services/availability.js';
import { notFound } from '../utils/AppError.js';
import { isoDate, objectId, pagination } from '../utils/schemas.js';

const router = Router();
const visible = { status: 'approved', ownerSuspended: false };
const publicFields = '-lockVersion -rejectionReason -ownerSuspended -cityKey -__v';

const searchSchema = z.object({
  city: z.string().trim().max(80).optional(),
  category: z.enum(CATEGORIES).optional(),
  ...pagination,
});

router.get('/', validate(searchSchema, 'query'), async (req, res) => {
  const { city, category, page, limit } = req.valid.query;
  const filter = { ...visible };
  if (city) filter.cityKey = city.toLowerCase();
  if (category) filter.category = category;

  const [items, total] = await Promise.all([
    Business.find(filter)
      .select('name category city address description photoIds')
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Business.countDocuments(filter),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
});

router.get('/:id', validate(z.object({ id: objectId }), 'params'), async (req, res) => {
  const business = await Business.findOne({ _id: req.params.id, ...visible }).select(publicFields);
  if (!business) throw notFound('Business');
  const [services, rentalAreas] = await Promise.all([
    Service.find({ businessId: business._id, active: true }).sort({ name: 1 }),
    RentalArea.find({ businessId: business._id, active: true }).select('-lockVersion').sort({ name: 1 }),
  ]);
  res.json({ business, services, rentalAreas });
});

const availabilitySchema = z.object({
  serviceIds: z
    .string()
    .transform((s) => s.split(',').filter(Boolean))
    .pipe(z.array(objectId).min(1)),
  areaId: objectId.optional(),
  date: isoDate,
});

router.get('/:id/availability', validate(availabilitySchema, 'query'), async (req, res) => {
  const { serviceIds, areaId, date } = req.valid.query;
  const sel = await resolveSelection({ businessId: req.params.id, serviceIds, rentalAreaId: areaId });
  const slots = await computeSlots({
    business: sel.business,
    durationMin: sel.durationMin,
    rentalAreaId: sel.area?._id,
    dateStr: date,
  });
  res.json({ date, durationMin: sel.durationMin, totalPrice: sel.totalPrice, timezone: sel.business.timezone, slots });
});

export default router;
