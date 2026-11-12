import 'dotenv/config';

const required = ['MONGODB_URI', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing environment variable ${key} (see .env.example)`);
}

const port = Number(process.env.PORT) || 5050;

export const config = {
  port,
  isProd: process.env.NODE_ENV === 'production',
  mongoUri: process.env.MONGODB_URI,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  // Public URL of this API, used in payment redirect and webhook URLs.
  apiUrl: process.env.API_URL || `http://localhost:${port}`,
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  accessTokenTtl: '15m',
  refreshTokenTtlDays: 7,

  // Launch market (PRD §1.3)
  defaultTimezone: process.env.DEFAULT_TIMEZONE || 'Africa/Dakar',
  currency: 'XOF',

  // Initial values of the admin-editable Settings document (PRD §7)
  cancellationCutoffHours: Number(process.env.CANCELLATION_CUTOFF_HOURS) || 2,
  holdMinutes: Number(process.env.HOLD_MINUTES) || 10,
  defaultCommissionRate: Number(process.env.DEFAULT_COMMISSION_RATE ?? 0.1),

  // Payments (PRD §6): mock until a real provider account exists.
  paymentProvider: process.env.PAYMENT_PROVIDER || 'mock',
  mockWebhookSecret: process.env.MOCK_WEBHOOK_SECRET || 'dev-mock-webhook-secret',
  mockPaymentAuto: process.env.MOCK_PAYMENT_AUTO || '', // '' | success | fail | none

  maxPhotosPerVenue: 10,
  maxImageBytes: 2 * 1024 * 1024,
};
