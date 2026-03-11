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

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
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

app.get('/healthz', (req, res) => res.json({ ok: true }));

app.use(errorHandler);

const PORT = process.env.PORT || 4000;

async function start() {
  try {
    await mongoose.connect(process.env.MONGODB_NON_SRV || process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err);
    console.warn('Starting without DB — some features may be limited.');
  }

  // Use http.createServer so WebSocket can share the same port
  const httpServer = createServer(app);
  initWebSocket(httpServer);

  httpServer.listen(PORT, () => {
    console.log(`Backend listening on port ${PORT}`);
    console.log(`WebSocket available at ws://localhost:${PORT}/ws`);
    console.log(`  Admin browser : ws://localhost:${PORT}/ws/admin?token=<JWT>`);
    console.log(`  Raspberry Pi  : ws://localhost:${PORT}/ws/pi?secret=<PI_SECRET>`);
  });
}

start();