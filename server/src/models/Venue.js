import mongoose from 'mongoose';
import { config } from '../config.js';
import { SPORTS } from '../domain/sizes.js';

const { Schema } = mongoose;

const interval = new Schema({ open: String, close: String }, { _id: false });
export const priceRule = new Schema({ days: [Number], from: String, to: String, price: Number }, { _id: false });

/** One price list per sport + size category (PRD v2.2 §5.3). */
const sizePricing = new Schema(
  { sport: { type: String, enum: SPORTS }, size: String, basePrice: Number, priceRules: [priceRule] },
  { _id: false },
);

const venueSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    city: { type: String, required: true, trim: true },
    cityKey: String, // lowercase city, for case-insensitive search
    district: { type: String, default: '', trim: true },
    address: { type: String, required: true },
    location: { type: { type: String, enum: ['Point'] }, coordinates: [Number] }, // [lng, lat] (Should)
    phone: String,
    whatsapp: String,
    photoIds: [{ type: Schema.Types.ObjectId, ref: 'Image' }],
    amenities: [String],
    sports: [String], // derived from active areas, for search
    timezone: { type: String, default: () => config.defaultTimezone },
    currency: { type: String, default: () => config.currency },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    rejectionReason: String,
    ownerSuspended: { type: Boolean, default: false },
    // day: 0 = Sunday … 6 = Saturday; close may be "24:00"
    openingHours: [new Schema({ day: Number, intervals: [interval] }, { _id: false })],
    exceptions: [new Schema({ date: String, closed: Boolean, intervals: [interval] }, { _id: false })],
    paymentMode: { type: String, enum: ['full', 'deposit'], default: 'full' },
    depositAmount: Number,
    commissionRate: Number, // admin-only override of Settings.commissionRate
    payoutWallet: { method: { type: String, enum: ['wave', 'orange_money', 'free_money'] }, phone: String },
    pricing: [sizePricing],
  },
  { timestamps: true },
);

venueSchema.pre('validate', function setCityKey(next) {
  if (this.city) this.cityKey = this.city.trim().toLowerCase();
  next();
});

venueSchema.index({ cityKey: 1, status: 1 });
venueSchema.index({ sports: 1 });
venueSchema.index({ location: '2dsphere' }, { sparse: true });

export const Venue = mongoose.model('Venue', venueSchema);
