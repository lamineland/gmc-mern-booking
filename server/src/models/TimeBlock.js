import mongoose from 'mongoose';

const { Schema } = mongoose;

const timeBlockSchema = new Schema(
  {
    venueId: { type: Schema.Types.ObjectId, ref: 'Venue', required: true },
    areaId: { type: Schema.Types.ObjectId, ref: 'Area', default: null }, // null = whole venue
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    reason: { type: String, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

timeBlockSchema.index({ venueId: 1, startAt: 1 });
timeBlockSchema.index({ areaId: 1, startAt: 1 });

export const TimeBlock = mongoose.model('TimeBlock', timeBlockSchema);
