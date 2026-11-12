import mongoose from 'mongoose';
import { config } from '../config.js';
import { DEFAULT_SIZE_CATEGORIES } from '../domain/sizes.js';

/** Single platform settings document, edited by the admin (PRD §7). */
const settingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'platform' },
    commissionRate: { type: Number, default: () => config.defaultCommissionRate, min: 0, max: 0.5 },
    commissionMin: Number,
    commissionMax: Number,
    cancellationCutoffHours: { type: Number, default: () => config.cancellationCutoffHours, min: 0 },
    holdMinutes: { type: Number, default: () => config.holdMinutes, min: 2, max: 30 },
    sizeCategories: { type: mongoose.Schema.Types.Mixed, default: () => DEFAULT_SIZE_CATEGORIES },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, minimize: false },
);

export const Settings = mongoose.model('Settings', settingsSchema);

let cache = null;

/** Current settings (created with defaults on first use). Cached; `invalidate` after edits. */
export async function getSettings() {
  if (!cache) cache = (await Settings.findById('platform').lean()) ?? (await Settings.create({ _id: 'platform' })).toObject();
  return cache;
}
export const invalidateSettings = () => {
  cache = null;
};
