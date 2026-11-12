import mongoose from 'mongoose';

const { Schema } = mongoose;

/** Every money movement for a venue (PRD §7). Owner balance = sum of amounts. */
const ledgerSchema = new Schema(
  {
    venueId: { type: Schema.Types.ObjectId, ref: 'Venue', required: true },
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking' },
    paymentId: { type: Schema.Types.ObjectId, ref: 'Payment' },
    payoutId: { type: Schema.Types.ObjectId, ref: 'Payout' },
    type: { type: String, enum: ['booking_income', 'commission', 'refund', 'commission_reversal', 'payout'], required: true },
    amount: { type: Number, required: true }, // signed, XOF, from the owner's point of view
  },
  { timestamps: true },
);

ledgerSchema.index({ venueId: 1, createdAt: 1 });

export const LedgerEntry = mongoose.model('LedgerEntry', ledgerSchema);
