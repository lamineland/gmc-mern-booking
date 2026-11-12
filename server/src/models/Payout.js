import mongoose from 'mongoose';

const { Schema } = mongoose;

const payoutSchema = new Schema(
  {
    venueId: { type: Schema.Types.ObjectId, ref: 'Venue', required: true },
    amount: { type: Number, required: true, min: 1 },
    method: { type: String, required: true },
    reference: { type: String, default: '' },
    paidAt: { type: Date, required: true },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    note: String,
  },
  { timestamps: true },
);

payoutSchema.index({ venueId: 1, paidAt: -1 });

export const Payout = mongoose.model('Payout', payoutSchema);
