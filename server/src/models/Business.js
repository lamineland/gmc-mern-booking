import mongoose from 'mongoose';
import { CATEGORIES, config } from '../config.js';

const { Schema } = mongoose;

const interval = new Schema({ open: String, close: String }, { _id: false });

const businessSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, enum: CATEGORIES, required: true },
    description: { type: String, default: '' },
    city: { type: String, required: true, trim: true },
    cityKey: { type: String, index: true }, // lowercase city, for case-insensitive search
    address: { type: String, required: true },
    phone: String,
    photoIds: [{ type: Schema.Types.ObjectId, ref: 'Image' }],
    timezone: { type: String, default: () => config.defaultTimezone },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    rejectionReason: String,
    ownerSuspended: { type: Boolean, default: false },
    // day: 0 = Sunday ... 6 = Saturday
    openingHours: [new Schema({ day: Number, intervals: [interval] }, { _id: false })],
    exceptions: [new Schema({ date: String, closed: Boolean, intervals: [interval] }, { _id: false })],
    slotStepMinutes: { type: Number, enum: [15, 30, 60], default: 30 },
    // Bumped inside booking transactions so concurrent bookings on this resource conflict
    lockVersion: { type: Number, default: 0, select: false },
  },
  { timestamps: true },
);

businessSchema.pre('validate', function setCityKey(next) {
  if (this.city) this.cityKey = this.city.trim().toLowerCase();
  next();
});

businessSchema.index({ cityKey: 1, category: 1, status: 1 });
businessSchema.index({ ownerId: 1 });

export const Business = mongoose.model('Business', businessSchema);
