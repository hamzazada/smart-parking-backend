// backend/src/controllers/bookings.controller.js
import Booking from '../models/booking.model.js';
import Session from '../models/session.model.js';
import Vehicle from '../models/vehicle.model.js';
import Notification from '../models/notification.model.js';

export async function listBookings(req, res, next) {
  try {
    const userId = req.user._id;
    const isAdmin = req.user.role === 'admin';

    const query = isAdmin ? {} : { user: userId };

    const bookings = await Booking.find(query)
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, data: bookings });
  } catch (err) {
    next(err);
  }
}

export async function createBooking(req, res, next) {
  try {
    const userId = req.user._id;
    const { slot, vehiclePlate } = req.body;

    if (!slot || !vehiclePlate) {
      return res.status(400).json({ success: false, message: 'slot and vehiclePlate required' });
    }

    // Check if slot is already active
    const existing = await Booking.findOne({ slot, status: 'Active' });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Slot already booked' });
    }

    // ── Create the Booking ────────────────────────────────
    const booking = await Booking.create({
      user: userId,
      slot,
      vehiclePlate,
      status: 'Active',
      amount: 0,
    });

    // ── Auto-create a linked Session ──────────────────────
    try {
      await Session.create({
        user:         userId,
        vehiclePlate: vehiclePlate.toUpperCase(),
        slot,
        start:        booking.start || new Date(),
        status:       'Active',
        bookingId:    booking._id,
      });
    } catch (sessionErr) {
      console.error('Failed to create session for booking:', sessionErr.message);
    }

    // ── Set Vehicle status → Active ────────────────────────
    try {
      await Vehicle.findOneAndUpdate(
        { user: userId, plate: vehiclePlate.toUpperCase() },
        { status: 'Active', lastSeen: new Date() }
      );
    } catch (vehicleErr) {
      console.error('Failed to update vehicle status on booking:', vehicleErr.message);
    }

    res.status(201).json({ success: true, data: booking });
  } catch (err) {
    next(err);
  }
}

export async function cancelBooking(req, res, next) {
  try {
    const userId  = req.user._id;
    const isAdmin = req.user.role === 'admin';
    const id      = req.params.id;

    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (!isAdmin && booking.user.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    if (booking.status !== 'Active') {
      return res.status(400).json({ success: false, message: 'Only active bookings can be cancelled' });
    }

    booking.status = 'Cancelled';
    booking.end    = new Date();
    await booking.save();

    // ── Also complete the linked Session ─────────────────
    try {
      const session = await Session.findOne({
        $or: [
          { bookingId: booking._id },
          { vehiclePlate: booking.vehiclePlate.toUpperCase(), slot: booking.slot, status: 'Active' },
        ],
      });

      if (session) {
        session.end    = booking.end;
        session.status = 'Completed';
        await session.save();
      }
    } catch (sessionErr) {
      console.error('Failed to complete session on booking cancel:', sessionErr.message);
    }

    await Notification.create({
      user:  booking.user,
      title: `Booking cancelled: ${booking.slot}`,
      body:  `Your booking for slot ${booking.slot} was cancelled.`,
      meta:  { bookingId: booking._id },
    });

    // ── Set Vehicle status → Idle ──────────────────────────
    try {
      await Vehicle.findOneAndUpdate(
        { user: booking.user, plate: booking.vehiclePlate.toUpperCase() },
        { status: 'Idle', lastSeen: new Date() }
      );
    } catch (vehicleErr) {
      console.error('Failed to reset vehicle status on cancel:', vehicleErr.message);
    }

    res.json({ success: true, data: booking.toObject() });
  } catch (err) {
    next(err);
  }
}

export async function completeBooking(req, res, next) {
  try {
    const userId  = req.user._id;
    const isAdmin = req.user.role === 'admin';
    const id      = req.params.id;

    const booking = await Booking.findById(id);
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    if (!isAdmin && booking.user.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    if (booking.status !== 'Active') {
      return res.status(400).json({ success: false, message: 'Only active bookings can be completed' });
    }

    booking.end    = new Date();
    booking.status = 'Completed';

    // Calculate fee: 50 PKR per hour (min 0.1 hr)
    const start         = booking.start || booking.createdAt;
    const durationHours = (booking.end.getTime() - new Date(start).getTime()) / 3600000;
    const hours         = Math.max(0.1, durationHours);
    booking.amount      = Math.round(hours * 50 * 100) / 100;

    await booking.save();

    // ── Also complete the linked Session ─────────────────
    try {
      const session = await Session.findOne({
        $or: [
          { bookingId: booking._id },
          { vehiclePlate: booking.vehiclePlate.toUpperCase(), slot: booking.slot, status: 'Active' },
        ],
      });

      if (session) {
        session.end      = booking.end;
        session.status   = 'Completed';
        session.totalFee = booking.amount;
        await session.save();
      }
    } catch (sessionErr) {
      console.error('Failed to complete session on booking complete:', sessionErr.message);
    }

    await Notification.create({
      user:  booking.user,
      title: `Booking completed: ${booking.slot}`,
      body:  `Your booking for slot ${booking.slot} is completed. Total charge: PKR ${booking.amount}.`,
      meta:  { bookingId: booking._id },
    });

    // ── Set Vehicle status → Idle ──────────────────────────
    try {
      await Vehicle.findOneAndUpdate(
        { user: booking.user, plate: booking.vehiclePlate.toUpperCase() },
        { status: 'Idle', lastSeen: new Date() }
      );
    } catch (vehicleErr) {
      console.error('Failed to reset vehicle status on complete:', vehicleErr.message);
    }

    res.json({ success: true, data: booking.toObject() });
  } catch (err) {
    next(err);
  }
}