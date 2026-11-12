import mongoose from 'mongoose';

const { Schema } = mongoose;

export const ACTIVE_STATUSES = ['confirmed', 'no_show'];

const bookingSchema = new Schema(
  {
    code: { type: String, required: true, unique: true }, // short code shown to players and owners, e.g. WP-7K3D
    venueId: { type: Schema.Types.ObjectId, ref: 'Venue', required: true },
    areaId: { type: Schema.Types.ObjectId, ref: 'Area', required: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    guest: { name: String, phone: String }, // manual bookings without an account
    source: { type: String, enum: ['online', 'manual', 'recurring'], required: true },
    seriesId: { type: Schema.Types.ObjectId, ref: 'BookingSeries' },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    slotCount: { type: Number, required: true },
    price: { type: Number, required: true },
    currency: { type: String, default: 'XOF' },
    priceBreakdown: [{ _id: false, startAt: Date, price: Number }],
    areaSnapshot: { name: String, format: String, sport: String, sizeCategory: String, lengthM: Number, widthM: Number },
    commissionRate: { type: Number, default: 0 },
    commission: { type: Number, default: 0 },
    amountDueOnline: { type: Number, default: 0 },
    amountDueAtVenue: { type: Number, default: 0 },
    ownerNet: { type: Number, default: 0 },
    paymentMode: { type: String, enum: ['full', 'deposit', 'on_site'], required: true },
    holdExpiresAt: Date, // pending_payment only
    note: String,
    status: {
      type: String,
      enum: ['pending_payment', 'confirmed', 'expired', 'cancelled_by_client', 'cancelled_by_owner', 'no_show'],
      required: true,
    },
    cancelReason: String,
    cancelledAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    idempotencyKey: String,
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

// "completed" is computed, not stored: a confirmed booking whose end time has passed.
bookingSchema.virtual('displayStatus').get(function displayStatus() {
  if (this.status === 'confirmed' && this.endAt < new Date()) return 'completed';
  return this.status;
});

bookingSchema.index({ areaId: 1, startAt: 1 });
bookingSchema.index({ venueId: 1, startAt: 1 });
bookingSchema.index({ clientId: 1, startAt: -1 });
// "Mes réservations" tabs filter on status, then sort by startAt.
bookingSchema.index({ clientId: 1, status: 1, startAt: -1 });
bookingSchema.index({ status: 1, holdExpiresAt: 1 });
bookingSchema.index({ clientId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });

export const Booking = mongoose.model('Booking', bookingSchema);
