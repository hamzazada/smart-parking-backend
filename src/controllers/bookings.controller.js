// backend/src/controllers/bookings.controller.js
import Booking      from '../models/booking.model.js';
import Session      from '../models/session.model.js';
import Vehicle      from '../models/vehicle.model.js';
import Notification from '../models/notification.model.js';
import { broadcastSlotUpdate } from '../websocket.js';

const FEE_PER_HOUR = 50;
const TAX_RATE     = 0.16;

// ── GET /api/v1/bookings ──────────────────────────────────────
export async function listBookings(req, res, next) {
  try {
    const userId  = req.user._id;
    const isAdmin = req.user.role === 'admin';
    const query   = isAdmin ? {} : { user: userId };
    const bookings = await Booking.find(query)
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, data: bookings });
  } catch (err) { next(err); }
}

// ── POST /api/v1/bookings ─────────────────────────────────────
// Creates a RESERVED booking — no billing yet
export async function createBooking(req, res, next) {
  try {
    const userId = req.user._id;
    const { slot, vehiclePlate } = req.body;

    if (!slot || !vehiclePlate)
      return res.status(400).json({ success: false, message: 'slot and vehiclePlate required' });

    // Check slot is not already Reserved or Active
    const existing = await Booking.findOne({ slot, status: { $in: ['Reserved', 'Active'] } });
    if (existing)
      return res.status(409).json({ success: false, message: 'Slot already booked or reserved' });

    const booking = await Booking.create({
      user: userId,
      slot,
      vehiclePlate: vehiclePlate.toUpperCase(),
      status: 'Reserved',        // ← NOT Active yet
      checkInTime: null,         // ← billing not started
      amount: 0,
    });

    res.status(201).json({ success: true, data: booking });

    // Broadcast slot as occupied (reserved) so others can't pick it
    broadcastSlotUpdate({ slot, status: 'occupied', vehiclePlate: vehiclePlate.toUpperCase() });

  } catch (err) { next(err); }
}

// ── PATCH /api/v1/bookings/:id/checkin ───────────────────────
// Manual check-in: Reserved → Active, billing clock starts
export async function checkInBooking(req, res, next) {
  try {
    const userId  = req.user._id;
    const isAdmin = req.user.role === 'admin';
    const booking = await Booking.findById(req.params.id);

    if (!booking)
      return res.status(404).json({ success: false, message: 'Booking not found' });

    if (!isAdmin && booking.user.toString() !== userId.toString())
      return res.status(403).json({ success: false, message: 'Forbidden' });

    if (booking.status !== 'Reserved')
      return res.status(400).json({ success: false, message: 'Only reserved bookings can be checked in' });

    booking.status        = 'Active';
    booking.checkInTime   = new Date();
    booking.checkInMethod = req.body.method || 'manual'; // 'manual' | 'anpr' | 'admin'
    await booking.save();

    // Create session — billing starts from checkInTime
    try {
      await Session.create({
        user:         booking.user,
        vehiclePlate: booking.vehiclePlate,
        slot:         booking.slot,
        start:        booking.checkInTime,
        status:       'Active',
        bookingId:    booking._id,
        feePerHour:   FEE_PER_HOUR,
      });
    } catch (e) { console.error('Session create failed:', e.message); }

    // Update vehicle status
    try {
      await Vehicle.findOneAndUpdate(
        { user: booking.user, plate: booking.vehiclePlate },
        { status: 'Active', lastSeen: new Date() }
      );
    } catch (e) { console.error('Vehicle update failed:', e.message); }

    // Notify user
    await Notification.create({
      user:  booking.user,
      title: `Checked in: Slot ${booking.slot}`,
      body:  `Your vehicle ${booking.vehiclePlate} has been checked in. Billing started.`,
      meta:  { bookingId: booking._id },
    }).catch(() => {});

    res.json({ success: true, data: booking });
  } catch (err) { next(err); }
}

// ── PATCH /api/v1/bookings/:id/cancel ────────────────────────
// Cancel: works on Reserved (free) OR Active (no charge if not checked in)
export async function cancelBooking(req, res, next) {
  try {
    const userId  = req.user._id;
    const isAdmin = req.user.role === 'admin';
    const booking = await Booking.findById(req.params.id);

    if (!booking)
      return res.status(404).json({ success: false, message: 'Booking not found' });

    if (!isAdmin && booking.user.toString() !== userId.toString())
      return res.status(403).json({ success: false, message: 'Forbidden' });

    if (!['Reserved', 'Active'].includes(booking.status))
      return res.status(400).json({ success: false, message: 'Only reserved or active bookings can be cancelled' });

    booking.status = 'Cancelled';
    booking.end    = new Date();
    // If they never checked in, amount = 0
    if (!booking.checkInTime) booking.amount = 0;
    await booking.save();

    // End any associated session
    try {
      const session = await Session.findOne({
        $or: [
          { bookingId: booking._id },
          { vehiclePlate: booking.vehiclePlate, slot: booking.slot, status: 'Active' },
        ],
      });
      if (session) {
        session.end    = booking.end;
        session.status = 'Completed';
        await session.save();
      }
    } catch (e) { console.error('Session end failed:', e.message); }

    // Reset vehicle
    try {
      await Vehicle.findOneAndUpdate(
        { user: booking.user, plate: booking.vehiclePlate },
        { status: 'Idle', lastSeen: new Date() }
      );
    } catch (e) { console.error('Vehicle reset failed:', e.message); }

    await Notification.create({
      user:  booking.user,
      title: `Booking cancelled: ${booking.slot}`,
      body:  booking.checkInTime
        ? `Your booking for slot ${booking.slot} was cancelled after check-in.`
        : `Your reservation for slot ${booking.slot} was cancelled. No charge applied.`,
      meta:  { bookingId: booking._id },
    }).catch(() => {});

    res.json({ success: true, data: booking });

    // Broadcast slot is now available
    broadcastSlotUpdate({ slot: booking.slot, status: 'available' });

  } catch (err) { next(err); }
}

// ── PATCH /api/v1/bookings/:id/complete ──────────────────────
// Complete: Active → Completed, calculate fee from checkInTime
export async function completeBooking(req, res, next) {
  try {
    const userId  = req.user._id;
    const isAdmin = req.user.role === 'admin';
    const booking = await Booking.findById(req.params.id);

    if (!booking)
      return res.status(404).json({ success: false, message: 'Booking not found' });

    if (!isAdmin && booking.user.toString() !== userId.toString())
      return res.status(403).json({ success: false, message: 'Forbidden' });

    if (booking.status !== 'Active')
      return res.status(400).json({ success: false, message: 'Only active bookings can be completed' });

   if (!booking.checkInTime) {
  booking.checkInTime = booking.start;
}
    booking.end    = new Date();
    booking.status = 'Completed';

    // ✅ Fee calculated from CHECK-IN TIME, not booking creation time
    const billingHours = Math.max(0.1, (booking.end - booking.checkInTime) / 3600000);
    const subtotal     = billingHours * FEE_PER_HOUR;
    booking.amount     = parseFloat((subtotal * (1 + TAX_RATE)).toFixed(2));

    await booking.save();

    // Update session
    try {
      const session = await Session.findOne({
        $or: [
          { bookingId: booking._id },
          { vehiclePlate: booking.vehiclePlate, slot: booking.slot, status: 'Active' },
        ],
      });
      if (session) {
        session.end      = booking.end;
        session.status   = 'Completed';
        session.totalFee = booking.amount;
        await session.save();
      }
    } catch (e) { console.error('Session complete failed:', e.message); }

    // Reset vehicle
    try {
      await Vehicle.findOneAndUpdate(
        { user: booking.user, plate: booking.vehiclePlate },
        { status: 'Idle', lastSeen: new Date() }
      );
    } catch (e) { console.error('Vehicle reset failed:', e.message); }

    await Notification.create({
      user:  booking.user,
      title: `Parking completed: ${booking.slot}`,
      body:  `Your vehicle ${booking.vehiclePlate} checked out. Total charge: PKR ${booking.amount}.`,
      meta:  { bookingId: booking._id },
    }).catch(() => {});

    res.json({ success: true, data: booking });

    // Broadcast slot is now available
    broadcastSlotUpdate({ slot: booking.slot, status: 'available' });

  } catch (err) { next(err); }
}

// ── PATCH /api/v1/bookings/:id/anpr-checkin ──────────────────
// Called by Raspberry Pi ANPR when plate is detected at entry
export async function anprCheckIn(req, res, next) {
  try {
    const { vehiclePlate, confidence } = req.body;

    if (!vehiclePlate)
      return res.status(400).json({ success: false, message: 'vehiclePlate required' });

    // Find a Reserved booking for this plate
    const booking = await Booking.findOne({
      vehiclePlate: vehiclePlate.toUpperCase(),
      status: 'Reserved',
    }).sort({ createdAt: -1 });

    if (!booking)
      return res.status(404).json({ success: false, message: `No reserved booking found for ${vehiclePlate}` });

    booking.status        = 'Active';
    booking.checkInTime   = new Date();
    booking.checkInMethod = 'anpr';
    await booking.save();

    // Create session
    try {
      await Session.create({
        user:         booking.user,
        vehiclePlate: booking.vehiclePlate,
        slot:         booking.slot,
        start:        booking.checkInTime,
        status:       'Active',
        bookingId:    booking._id,
        feePerHour:   FEE_PER_HOUR,
      });
    } catch (e) { console.error('Session create failed:', e.message); }

    try {
      await Vehicle.findOneAndUpdate(
        { user: booking.user, plate: booking.vehiclePlate },
        { status: 'Active', lastSeen: new Date() }
      );
    } catch (e) {}

    await Notification.create({
      user:  booking.user,
      title: `Auto check-in: Slot ${booking.slot}`,
      body:  `Your vehicle ${booking.vehiclePlate} was detected by camera. Billing started automatically.`,
      meta:  { bookingId: booking._id },
    }).catch(() => {});

    // Broadcast to all connected users
    broadcastSlotUpdate({ slot: booking.slot, status: 'occupied', vehiclePlate: booking.vehiclePlate, method: 'anpr' });

    res.json({ success: true, data: booking, message: 'ANPR check-in successful' });
  } catch (err) { next(err); }
}