import { Router } from 'express';
import { z } from 'zod';
import { Booking } from '../models/Booking.js';
import { Business } from '../models/Business.js';
import { User } from '../models/User.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { notifier } from '../services/notifier.js';
import { AppError, notFound } from '../utils/AppError.js';
import { pagination } from '../utils/schemas.js';

const router = Router();
router.use(authenticate, requireRole('admin'));

// ---- Businesses ----------------------------------------------------------------------

const businessQuery = z.object({ status: z.enum(['pending', 'approved', 'rejected']).default('pending'), ...pagination });

router.get('/businesses', validate(businessQuery, 'query'), async (req, res) => {
  const { status, page, limit } = req.valid.query;
  const [items, total] = await Promise.all([
    Business.find({ status })
      .sort({ updatedAt: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('ownerId', 'name email phone status'),
    Business.countDocuments({ status }),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
});

router.patch('/businesses/:id/approve', async (req, res) => {
  const business = await Business.findByIdAndUpdate(
    req.params.id,
    { status: 'approved', $unset: { rejectionReason: 1 } },
    { new: true },
  );
  if (!business) throw notFound('Business');
  notifier.businessReviewed(business._id);
  res.json({ business });
});

router.patch(
  '/businesses/:id/reject',
  validate(z.object({ reason: z.string().trim().min(3, 'Please give a reason').max(500) })),
  async (req, res) => {
    const business = await Business.findByIdAndUpdate(
      req.params.id,
      { status: 'rejected', rejectionReason: req.valid.body.reason },
      { new: true },
    );
    if (!business) throw notFound('Business');
    notifier.businessReviewed(business._id);
    res.json({ business });
  },
);

// ---- Users ------------------------------------------------------------------------------

const userQuery = z.object({
  role: z.enum(['client', 'owner', 'admin']).optional(),
  status: z.enum(['active', 'suspended']).optional(),
  q: z.string().trim().max(100).optional(),
  ...pagination,
});

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

router.get('/users', validate(userQuery, 'query'), async (req, res) => {
  const { role, status, q, page, limit } = req.valid.query;
  const filter = {};
  if (role) filter.role = role;
  if (status) filter.status = status;
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: rx }, { email: rx }];
  }
  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    User.countDocuments(filter),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
});

async function targetUser(req) {
  const user = await User.findById(req.params.id);
  if (!user) throw notFound('User');
  if (user.role === 'admin') throw new AppError(403, 'FORBIDDEN', 'Admins cannot be changed here');
  return user;
}

router.patch('/users/:id/suspend', async (req, res) => {
  const user = await targetUser(req);
  await User.updateOne({ _id: user._id }, { status: 'suspended', $inc: { tokenVersion: 1 } });

  let upcomingBookingsAffected = 0;
  if (user.role === 'owner') {
    const businesses = await Business.find({ ownerId: user._id }).select('_id');
    await Business.updateMany({ ownerId: user._id }, { ownerSuspended: true });
    upcomingBookingsAffected = await Booking.countDocuments({
      businessId: { $in: businesses.map((b) => b._id) },
      status: 'confirmed',
      startAt: { $gt: new Date() },
    });
  }
  res.json({ user: { ...user.toJSON(), status: 'suspended' }, upcomingBookingsAffected });
});

router.patch('/users/:id/reactivate', async (req, res) => {
  const user = await targetUser(req);
  user.status = 'active';
  await user.save();
  if (user.role === 'owner') await Business.updateMany({ ownerId: user._id }, { ownerSuspended: false });
  res.json({ user });
});

router.delete('/users/:id', async (req, res) => {
  const user = await targetUser(req);
  if (user.role === 'owner' && (await Business.exists({ ownerId: user._id }))) {
    throw new AppError(409, 'HAS_BUSINESSES', 'This owner has businesses. Suspend the account instead.');
  }
  if (await Booking.exists({ clientId: user._id, status: 'confirmed', startAt: { $gt: new Date() } })) {
    throw new AppError(409, 'HAS_UPCOMING_BOOKINGS', 'This client has upcoming bookings. Suspend the account instead.');
  }
  await user.deleteOne();
  res.status(204).end();
});

router.get('/stats', async (req, res) => {
  const [users, businesses, pendingBusinesses, bookings] = await Promise.all([
    User.countDocuments(),
    Business.countDocuments(),
    Business.countDocuments({ status: 'pending' }),
    Booking.countDocuments(),
  ]);
  res.json({ users, businesses, pendingBusinesses, bookings });
});

export default router;
