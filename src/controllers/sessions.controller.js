// backend/src/controllers/sessions.controller.js
import Session      from '../models/session.model.js';
import Vehicle      from '../models/vehicle.model.js';
import Booking      from '../models/booking.model.js';
import Notification from '../models/notification.model.js';

// ─────────────────────────────────────────────────────────────
// GET /api/v1/sessions/active
// ─────────────────────────────────────────────────────────────
export async function listActiveSessions(req, res, next) {
  try {
    const userId  = req.user._id;
    const sessions = await Session.find({ user: userId, status: 'Active' })
      .sort({ start: -1 })
      .lean({ virtuals: true });
    res.json({ success: true, data: sessions.map(enrichSession) });
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────
// GET /api/v1/sessions
// ─────────────────────────────────────────────────────────────
export async function listAllSessions(req, res, next) {
  try {
    const userId  = req.user._id;
    const isAdmin = req.user.role === 'admin';
    const { status, search, page = 1, limit = 10 } = req.query;

    const filter = isAdmin ? {} : { user: userId };
    if (status && ['Active', 'Completed'].includes(status)) filter.status = status;
    if (search) {
      filter.$or = [
        { vehiclePlate: { $regex: search, $options: 'i' } },
        { slot:         { $regex: search, $options: 'i' } },
      ];
    }

    const total    = await Session.countDocuments(filter);
    const sessions = await Session.find(filter)
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .skip((+page - 1) * +limit)
      .limit(+limit)
      .lean({ virtuals: true });

    res.json({
      success: true,
      data: sessions.map(enrichSession),
      pagination: { total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) },
    });
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────
// POST /api/v1/sessions
// ─────────────────────────────────────────────────────────────
export async function createSession(req, res, next) {
  try {
    const userId = req.user._id;
    const { vehiclePlate, slot } = req.body;

    if (!vehiclePlate) {
      return res.status(400).json({ success: false, message: 'vehiclePlate is required' });
    }

    const existing = await Session.findOne({
      user: userId, vehiclePlate: vehiclePlate.toUpperCase(), status: 'Active',
    });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Vehicle ${vehiclePlate.toUpperCase()} already has an active session`,
      });
    }

    if (slot) {
      const slotTaken = await Session.findOne({ slot, status: 'Active' });
      if (slotTaken) {
        return res.status(409).json({ success: false, message: `Slot ${slot} is already occupied` });
      }
    }

    const session = await Session.create({
      user: userId, vehiclePlate, slot, start: new Date(), status: 'Active', feePerHour: 50,
    });

    // Mark vehicle Active
    try {
      await Vehicle.findOneAndUpdate(
        { user: userId, plate: vehiclePlate.toUpperCase() },
        { status: 'Active', lastSeen: new Date() }
      );
    } catch (e) { console.error('Vehicle update failed:', e.message); }

    res.status(201).json({ success: true, data: enrichSession(session.toJSON()) });
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────
// GET /api/v1/sessions/:id
// ─────────────────────────────────────────────────────────────
export async function getSessionById(req, res, next) {
  try {
    const userId  = req.user._id;
    const isAdmin = req.user.role === 'admin';
    const session = await Session.findById(req.params.id).lean({ virtuals: true });

    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    if (!isAdmin && session.user.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    res.json({ success: true, data: enrichSession(session) });
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────
// PATCH /api/v1/sessions/:id
// ─────────────────────────────────────────────────────────────
export async function updateSession(req, res, next) {
  try {
    const userId  = req.user._id;
    const isAdmin = req.user.role === 'admin';
    const session = await Session.findById(req.params.id);

    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    if (!isAdmin && session.user.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    if (session.status === 'Completed') {
      return res.status(400).json({ success: false, message: 'Cannot update a completed session' });
    }

    ['vehiclePlate', 'slot'].forEach(f => {
      if (req.body[f] !== undefined) session[f] = req.body[f];
    });

    await session.save();
    res.json({ success: true, data: enrichSession(session.toJSON()) });
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────
// POST /api/v1/sessions/:id/complete
// ── FIX 1: resets Vehicle → Idle
// ── FIX 2: syncs Booking amount + status so money is saved
// ─────────────────────────────────────────────────────────────
export async function completeSession(req, res, next) {
  try {
    const userId  = req.user._id;
    const isAdmin = req.user.role === 'admin';

    const session = await Session.findById(req.params.id);
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    if (!isAdmin && session.user.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    if (session.status !== 'Active') {
      return res.status(400).json({ success: false, message: 'Only active sessions can be completed' });
    }

    session.end    = new Date();
    session.status = 'Completed';
    await session.save(); // pre-save hook calculates totalFee

    // Calculate fee for syncing (PKR 50/hr)
    const durationHours = Math.max(0.1, (session.end - session.start) / 3600000);
    const fee           = parseFloat((durationHours * 50).toFixed(2));

    // ── FIX 1: Vehicle → Idle ────────────────────────────
    try {
      await Vehicle.findOneAndUpdate(
        { user: session.user, plate: session.vehiclePlate.toUpperCase() },
        { status: 'Idle', lastSeen: new Date() }
      );
    } catch (e) { console.error('Vehicle reset failed:', e.message); }

    // ── FIX 2: Sync linked Booking + capture bookingId ───
    let resolvedBookingId = session.bookingId || null;
    try {
      const booking = await Booking.findOne({
        $or: [
          ...(session.bookingId ? [{ _id: session.bookingId }] : []),
          { vehiclePlate: session.vehiclePlate.toUpperCase(), slot: session.slot, status: 'Active' },
          { vehiclePlate: session.vehiclePlate.toUpperCase(), slot: session.slot, status: 'Completed', amount: { $in: [0, null] } },
        ],
      });

      if (booking) {
        booking.end    = session.end;
        booking.status = 'Completed';
        booking.amount = 0; // keep 0 — payment controller sets the real amount when user pays
        await booking.save();
        resolvedBookingId = booking._id; // always capture it

        // Also store on session for future lookups
        if (!session.bookingId) {
          session.bookingId = booking._id;
          await session.save();
        }
      }
    } catch (e) { console.error('Booking sync failed:', e.message); }

    // ── Notification ─────────────────────────────────────
    try {
      await Notification.create({
        user:  session.user,
        title: `Session ended: Slot ${session.slot}`,
        body:  `${session.vehiclePlate} parked for ${Math.round(durationHours * 60)} min. Fee: PKR ${fee}.`,
        meta:  { sessionId: session._id },
      });
    } catch (e) { console.error('Notification failed:', e.message); }

    // Always include bookingId in response so frontend can open payment modal
    const sessionData = enrichSession(session.toJSON());
    res.json({ success: true, data: { ...sessionData, bookingId: resolvedBookingId } });
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────
// POST /api/v1/sessions/:id/reopen
// Restores a just-completed session back to Active
// Used when user closes payment modal without paying
// ─────────────────────────────────────────────────────────────
export async function reopenSession(req, res, next) {
  try {
    const userId  = req.user._id;
    const session = await Session.findById(req.params.id);

    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    if (session.user.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    if (session.status !== 'Completed') {
      return res.status(400).json({ success: false, message: 'Only completed sessions can be reopened' });
    }

    // Restore session to Active
    session.end    = null;
    session.status = 'Active';
    session.totalFee = 0;
    await session.save();

    // Restore booking to Active with amount 0
    try {
      const booking = await Booking.findOne({
        $or: [
          ...(session.bookingId ? [{ _id: session.bookingId }] : []),
          { vehiclePlate: session.vehiclePlate, slot: session.slot, status: 'Completed', amount: 0 },
        ],
      });
      if (booking) {
        booking.end    = null;
        booking.status = 'Active';
        booking.amount = 0;
        await booking.save();
      }
    } catch (e) { console.error('Booking reopen failed:', e.message); }

    // Restore vehicle to Active
    try {
      await Vehicle.findOneAndUpdate(
        { user: session.user, plate: session.vehiclePlate.toUpperCase() },
        { status: 'Active' }
      );
    } catch (e) { console.error('Vehicle restore failed:', e.message); }

    res.json({ success: true, data: enrichSession(session.toJSON()) });
  } catch (err) { next(err); }
}


// ─────────────────────────────────────────────────────────────
export async function extendSession(req, res, next) {
  try {
    const userId  = req.user._id;
    const isAdmin = req.user.role === 'admin';
    const { additionalHours } = req.body;

    if (!additionalHours || additionalHours <= 0) {
      return res.status(400).json({ success: false, message: 'additionalHours must be a positive number' });
    }

    const session = await Session.findById(req.params.id);
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    if (!isAdmin && session.user.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    if (session.status !== 'Active') {
      return res.status(400).json({ success: false, message: 'Only active sessions can be extended' });
    }

    session.extendedHours = (session.extendedHours || 0) + Number(additionalHours);
    await session.save();

    res.json({ success: true, data: enrichSession(session.toJSON()) });
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────
// Helper: inject live durationMinutes & currentFee
// ─────────────────────────────────────────────────────────────
function enrichSession(s) {
  const end             = s.end || new Date();
  const durationMinutes = Math.floor((end - new Date(s.start)) / 60000);
  const fph = s.feePerHour && s.feePerHour > 10 ? s.feePerHour : 50;
  const currentFee      = parseFloat(((durationMinutes / 60) * fph * 1.16).toFixed(2));
  return { ...s, durationMinutes, currentFee };
}