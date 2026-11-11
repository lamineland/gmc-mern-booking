import mongoose from 'mongoose';

const rentalAreaSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, default: '' },
    capacity: { type: Number, default: 1, min: 1 },
    photoIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Image' }],
    active: { type: Boolean, default: true },
    lockVersion: { type: Number, default: 0, select: false },
  },
  { timestamps: true },
);

export const RentalArea = mongoose.model('RentalArea', rentalAreaSchema);
