import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import eventRoutes from './routes/events.js';
import taskRoutes from './routes/tasks.js';
import notificationRoutes from './routes/notifications.js';
import chatRoutes from './routes/chat.js';
import adminRoutes from './routes/admin.js';
import volunteerRoutes from './routes/volunteers.js';
import { allowedOrigins } from './config/origins.js';
import { notFound, errorHandler } from './middleware/errors.js';

const app = express();

app.disable('x-powered-by');

// Render (and most hosts) sit behind a proxy. Without this, rate limiting
// sees every user as the same IP and blocks everyone together.
app.set('trust proxy', 1);

app.use(helmet());

console.log('ALLOWED ORIGINS:', allowedOrigins);
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

const healthHandler = (_req, res) =>
  res.json({
    success: true,
    message: 'CampusCrew API is healthy',
    data: {
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
    },
  });

app.get('/api/health', healthHandler);
app.get('/api/v1/health', healthHandler);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: true,
  legacyHeaders: false,
  // /me is called on every page load; campus Wi-Fi shares one IP, so don't count it.
  skip: (req) => req.path === '/me' || req.path === '/logout',
  message: {
    success: false,
    message: 'Too many requests. Please try again later.',
    data: null,
  },
});

app.use('/api/v1/auth', authLimiter);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/events', eventRoutes);
app.use('/api/v1/tasks', taskRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/chat', chatRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/volunteers', volunteerRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;