import mongoose from 'mongoose';

// Images live in MongoDB for now (see PRD §5.1). Access them only through services/storage.js.
const imageSchema = new mongoose.Schema(
  {
    ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    contentType: { type: String, required: true },
    size: { type: Number, required: true },
    data: { type: Buffer, required: true },
  },
  { timestamps: true },
);

export const Image = mongoose.model('Image', imageSchema);
