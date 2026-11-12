import mongoose from 'mongoose';
import { SPORTS } from '../domain/sizes.js';
import { priceRule } from './Venue.js';

const { Schema } = mongoose;

const areaSchema = new Schema(
  {
    venueId: { type: Schema.Types.ObjectId, ref: 'Venue', required: true, index: true },
    name: { type: String, required: true, trim: true },
    sport: { type: String, enum: SPORTS, required: true },
    format: { type: String, default: '' }, // owner label: "Foot à 5", "3 contre 3"…
    surface: { type: String, default: '' },
    indoor: { type: Boolean, default: false },
    lit: { type: Boolean, default: true },
    maxPlayers: { type: Number, min: 1, default: 10 },
    lengthM: { type: Number, required: true, min: 5, max: 150 },
    widthM: { type: Number, required: true, min: 5, max: 100 },
    sizeCategory: { type: String, required: true }, // derived on save from sport + lengthM × widthM
    photoIds: [{ type: Schema.Types.ObjectId, ref: 'Image' }],
    active: { type: Boolean, default: true },
    slotMinutes: { type: Number, enum: [15, 30, 60], default: 30 },
    minSlots: { type: Number, min: 1, default: 1 },
    maxSlots: { type: Number, min: 1, default: 6 },
    bookingHorizonDays: { type: Number, min: 1, max: 365, default: 30 },
    pricing: { basePrice: Number, priceRules: [priceRule] }, // optional override of the venue's size list
    linkedAreaIds: [{ type: Schema.Types.ObjectId, ref: 'Area' }], // Should: full pitch = halves
    // Bumped inside booking transactions so concurrent bookings on this area conflict
    lockVersion: { type: Number, default: 0, select: false },
  },
  { timestamps: true },
);

areaSchema.set('toJSON', {
  transform: (_doc, ret) => {
    if (ret.pricing?.basePrice == null) delete ret.pricing;
    delete ret.__v;
    return ret;
  },
});

export const Area = mongoose.model('Area', areaSchema);
