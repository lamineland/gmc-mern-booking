import mongoose from 'mongoose';

const { Schema } = mongoose;

const itemSchema = new Schema(
  {
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service', required: true },
    name: { type: String, required: true },
    durationMin: { type: Number, required: true },
    price: { type: Number, required: true },
  },
  { _id: false },
);

const bookingSchema = new Schema(
  {
    clientId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    businessId: { type: Schema.Types.ObjectId, ref: 'Business', required: true },
    rentalAreaId: { type: Schema.Types.ObjectId, ref: 'RentalArea', default: null },
    items: {
      type: [itemSchema],
      validate: [(v) => v.length > 0, 'A booking needs at least one service'],
    },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    totalPrice: { type: Number, required: true },
    status: {
      type: String,
      enum: ['confirmed', 'cancelled_by_client', 'cancelled_by_owner'],
      default: 'confirmed',
    },
    cancelReason: String,
    cancelledAt: Date,
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

// "completed" is derived instead of stored: a confirmed booking whose end time has passed.
bookingSchema.virtual('displayStatus').get(function displayStatus() {
  if (this.status === 'confirmed' && this.endAt < new Date()) return 'completed';
  return this.status;
});

bookingSchema.index({ businessId: 1, startAt: 1 });
bookingSchema.index({ rentalAreaId: 1, startAt: 1 });
bookingSchema.index({ clientId: 1, startAt: -1 });

export const Booking = mongoose.model('Booking', bookingSchema);
