import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    phone: { type: String, trim: true },
    role: { type: String, enum: ['client', 'owner', 'admin'], required: true },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
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
