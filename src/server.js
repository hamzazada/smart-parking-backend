/* backend/src/index.js */
import './config/env.js';
import express    from 'express';
import cors       from 'cors';
import mongoose   from 'mongoose';
import dotenv     from 'dotenv';
import { createServer } from 'http';

import usersRouter         from './routes/v1/users.routes.js';
import authRouter          from './routes/v1/auth.routes.js';
import vehiclesRouter      from './routes/v1/vehicles.routes.js';
import sessionsRouter      from './routes/v1/sessions.routes.js';
import bookingsRouter      from './routes/v1/bookings.routes.js';
import supportRouter       from './routes/v1/support.routes.js';
import notificationsRouter from './routes/v1/notifications.routes.js';
import analyticsRouter     from './routes/v1/analytics.routes.js';
import historyRouter       from './routes/v1/history.routes.js';
import paymentRouter       from './routes/v1/payment.routes.js';
import dashboardRouter     from './routes/v1/dashboard.routes.js';
import { errorHandler }    from './middlewares/errorHandler.js';
import { initWebSocket }   from './websocket.js';

dotenv.config();

const app = express();

const allowedOrigins = [
  'http://localhost:3000',
  'https://smart-parking-frontend-lyart.vercel.app',
  'https://smart-parking-frontend-wine.vercel.app',
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || origin.includes('vercel.app')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: '5mb' }));

app.use('/api/v1/auth',          authRouter);
app.use('/api/v1/users',         usersRouter);
app.use('/api/v1/vehicles',      vehiclesRouter);
app.use('/api/v1/sessions',      sessionsRouter);
app.use('/api/v1/bookings',      bookingsRouter);
app.use('/api/v1/support',       supportRouter);
app.use('/api/v1/notifications', notificationsRouter);
app.use('/api/v1/analytics',     analyticsRouter);
app.use('/api/v1/history',       historyRouter);
app.use('/api/v1/payments',      paymentRouter);
app.use('/api/v1/dashboard',     dashboardRouter);

// Health check endpoint (also used for keep-alive)
app.get('/healthz', (req, res) => res.json({ ok: true, ts: Date.now() }));

app.use(errorHandler);

const PORT = process.env.PORT || 4000;

async function start() {
  try {
    await mongoose.connect(process.env.MONGODB_NON_SRV || process.env.MONGODB_URI, {
      maxPoolSize:        10,   // connection pool — reuse connections
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS:    45000,
    });
    console.log('Connected to MongoDB');

    // Create indexes for faster queries
    const { default: Booking } = await import('./models/booking.model.js');
    const { default: Session } = await import('./models/session.model.js');
    await Promise.all([
      Booking.collection.createIndex({ slot: 1, status: 1 }),
      Booking.collection.createIndex({ user: 1, createdAt: -1 }),
      Booking.collection.createIndex({ vehiclePlate: 1, status: 1 }),
      Session.collection.createIndex({ status: 1 }),
      Session.collection.createIndex({ user: 1, status: 1 }),
    ]).catch(e => console.warn('Index creation skipped:', e.message));

  } catch (err) {
    console.error('Failed to connect to MongoDB:', err);
    console.warn('Starting without DB — some features may be limited.');
  }

  const httpServer = createServer(app);
  initWebSocket(httpServer);

  httpServer.listen(PORT, () => {
    console.log(`Backend listening on port ${PORT}`);
    console.log(`WebSocket available at ws://localhost:${PORT}/ws`);
    console.log(`  Admin browser : ws://localhost:${PORT}/ws/admin?token=<JWT>`);
    console.log(`  Raspberry Pi  : ws://localhost:${PORT}/ws/pi?secret=<PI_SECRET>`);
  });

  // ── Keep Render free tier alive ───────────────────────────
  // Render spins down after 15min inactivity → 30s cold start
  // Ping self every 14 minutes to stay warm
  if (process.env.NODE_ENV === 'production') {
    const SELF_URL = process.env.RENDER_EXTERNAL_URL || 'https://smart-parking-api-ingc.onrender.com';
    setInterval(async () => {
      try {
        const res = await fetch(`${SELF_URL}/healthz`);
        console.log(`[keep-alive] ping ${res.status}`);
      } catch (e) {
        console.warn('[keep-alive] ping failed:', e.message);
      }
    }, 14 * 60 * 1000); // every 14 minutes
    console.log('[keep-alive] Render keep-alive enabled');
  }
}

start();