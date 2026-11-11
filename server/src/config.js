import 'dotenv/config';

const required = ['MONGODB_URI', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing environment variable ${key} (see .env.example)`);
}

export const config = {
  port: Number(process.env.PORT) || 5050,
  isProd: process.env.NODE_ENV === 'production',
  mongoUri: process.env.MONGODB_URI,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  accessTokenTtl: '15m',
  refreshTokenTtlDays: 7,
  cancellationCutoffHours: Number(process.env.CANCELLATION_CUTOFF_HOURS) || 2,
  defaultTimezone: process.env.DEFAULT_TIMEZONE || 'UTC',
  maxServicesPerBooking: 5,
  maxPhotosPerBusiness: 10,
  maxImageBytes: 2 * 1024 * 1024,
};

export const CATEGORIES = ['salon', 'football', 'gym', 'other'];
