import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { config } from './config.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import authRoutes from './routes/auth.js';
import businessRoutes from './routes/businesses.js';
import bookingRoutes from './routes/bookings.js';
import ownerRoutes from './routes/owner.js';
import adminRoutes from './routes/admin.js';
import imageRoutes from './routes/images.js';

export const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: config.clientUrl, credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
if (!config.isProd) app.use(morgan('dev'));

app.get('/api/v1/health', (req, res) => res.json({ ok: true }));
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/businesses', businessRoutes);
app.use('/api/v1/bookings', bookingRoutes);
app.use('/api/v1/owner', ownerRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/images', imageRoutes);

app.use(notFoundHandler);
app.use(errorHandler);
