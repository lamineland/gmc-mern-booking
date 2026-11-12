import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { config } from './config.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import authRoutes from './routes/auth.js';
import publicRoutes from './routes/public.js';
import webhookRoutes from './routes/webhooks.js';
import bookingRoutes from './routes/bookings.js';
import ownerRoutes from './routes/owner.js';
import adminRoutes from './routes/admin.js';
import imageRoutes from './routes/images.js';

export const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: config.clientUrl, credentials: true }));
// rawBody is kept for payment webhook signature checks.
app.use(express.json({ limit: '100kb', verify: (req, res, buf) => { req.rawBody = buf.toString('utf8'); } }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(cookieParser());
if (!config.isProd) app.use(morgan('dev'));

app.get('/api/v1/health', (req, res) => res.json({ ok: true }));
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/bookings', bookingRoutes);
app.use('/api/v1/owner', ownerRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/images', imageRoutes);
app.use('/api/v1/webhooks', webhookRoutes);
if (!config.isProd) app.use('/api/v1/mock-pay', (await import('./routes/mockPay.js')).default);
app.use('/api/v1', publicRoutes);

app.use(notFoundHandler);
app.use(errorHandler);
