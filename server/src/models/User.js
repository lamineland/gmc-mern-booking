import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Phone is the main identity in Senegal (PRD §4.1): E.164, e.g. +221771234567
    phone: { type: String, required: true, unique: true, trim: true },
    email: { type: String, lowercase: true, trim: true, unique: true, sparse: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['client', 'owner', 'admin'], required: true },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    noShowCount: { type: Number, default: 0 },
    phoneVerifiedAt: Date,
    // Incremented on logout/suspension to invalidate refresh tokens
    tokenVersion: { type: Number, default: 0, select: false },
  },
  { timestamps: true },
);

userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    delete ret.tokenVersion;
    delete ret.__v;
    return ret;
  },
});

export const User = mongoose.model('User', userSchema);
