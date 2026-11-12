import mongoose from 'mongoose';

const { Schema } = mongoose;

const paymentSchema = new Schema(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
    venueId: { type: Schema.Types.ObjectId, ref: 'Venue', required: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'User' },
    kind: { type: String, enum: ['charge', 'refund'], required: true },
    provider: { type: String, required: true },
    method: { type: String, enum: ['wave', 'orange_money', 'free_money'], required: true },
    phone: String,
    amount: { type: Number, required: true },
    currency: { type: String, default: 'XOF' },
    status: { type: String, enum: ['pending', 'succeeded', 'failed', 'expired', 'refund_failed'], default: 'pending' },
    providerRef: { type: String, unique: true, sparse: true },
    redirectUrl: String,
    providerFee: Number,
    failureReason: String,
    reason: String, // refunds: why the money goes back
    countsInLedger: { type: Boolean, default: true }, // refunds of money never counted as owner income: false
    // Webhook log; eventId makes processing idempotent.
    events: [{ _id: false, eventId: String, status: String, receivedAt: Date, raw: Schema.Types.Mixed }],
  },
  { timestamps: true },
);

paymentSchema.index({ 'events.eventId': 1 });
paymentSchema.index({ status: 1, createdAt: 1 });

export const Payment = mongoose.model('Payment', paymentSchema);
