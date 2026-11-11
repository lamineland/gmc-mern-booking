import mongoose from 'mongoose';

const serviceSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    durationMin: { type: Number, required: true, min: 5 },
    price: { type: Number, required: true, min: 0 },
    usesRentalArea: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Service = mongoose.model('Service', serviceSchema);
