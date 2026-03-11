// backend/src/controllers/bookings.controller.js
import Booking from '../models/booking.model.js';
import Session from '../models/session.model.js';
import Vehicle from '../models/vehicle.model.js';
import Notification from '../models/notification.model.js';
import { broadcastSlotUpdate } from '../websocket.js';

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

export async function createBooking(req, res, next) {
  try {
    const userId = req.user._id;
    const { slot, vehiclePlate } = req.body;

    if (!slot || !vehiclePlate)
      return res.status(400).json({ success: false, message: 'slot and vehiclePlate required' });

    const existing = await Booking.findOne({ slot, status: 'Active' });
    if (existing)
      return res.status(409).json({ success: false, message: 'Slot already booked' });

    const booking = await Booking.create({ user: userId, slot, vehiclePlate, status: 'Active', amount: 0 });

    try {
      await Session.create({
        user: userId, vehiclePlate: vehiclePlate.toUpperCase(),
        slot, start: booking.start || new Date(), status: 'Active', bookingId: booking._id,
      });
    } catch (e) { console.error('Failed to create session:', e.message); }

    try {
      await Vehicle.findOneAndUpdate(
        { user: userId, plate: vehiclePlate.toUpperCase() },
        { status: 'Active', lastSeen: new Date() }
      );
    } catch (e) { console.error('Failed to update vehicle:', e.message); }

    res.status(201).json({ success: true, data: booking });

    // 🔴 Broadcast slot is now occupied to all connected users
    broadcastSlotUpdate({ slot, status: 'occupied', vehiclePlate: vehiclePlate.toUpperCase() });

  } catch (err) { next(err); }
}

export async function cancelBooking(req, res, next) {
  try {
    const userId  = req.user._id;
    const isAdmin = req.user.role === 'admin';
    const id      = req.params.id;

    const booking = await Booking.findById(id);
    if (!booking)
      return res.status(404).json({ success: false, message: 'Booking not found' });

    if (!isAdmin && booking.user.toString() !== userId.toString())
      return res.status(403).json({ success: false, message: 'Forbidden' });

    if (booking.status !== 'Active')
      return res.status(400).json({ success: false, message: 'Only active bookings can be cancelled' });

    booking.status = 'Cancelled';
    booking.end    = new Date();
    await booking.save();

    try {
      const session = await Session.findOne({
        $or: [
          { bookingId: booking._id },
          { vehiclePlate: booking.vehiclePlate.toUpperCase(), slot: booking.slot, status: 'Active' },
        ],
      });
      if (session) { session.end = booking.end; session.status = 'Completed'; await session.save(); }
    } catch (e) { console.error('Failed to complete session on cancel:', e.message); }

    await Notification.create({
      user: booking.user,
      title: `Booking cancelled: ${booking.slot}`,
      body:  `Your booking for slot ${booking.slot} was cancelled.`,
      meta:  { bookingId: booking._id },
    });

    try {
      await Vehicle.findOneAndUpdate(
        { user: booking.user, plate: booking.vehiclePlate.toUpperCase() },
        { status: 'Idle', lastSeen: new Date() }
      );
    } catch (e) { console.error('Failed to reset vehicle on cancel:', e.message); }

    res.json({ success: true, data: booking.toObject() });

    // 🟢 Broadcast slot is now available to all connected users
    broadcastSlotUpdate({ slot: booking.slot, status: 'available' });

  } catch (err) { next(err); }
}

export async function completeBooking(req, res, next) {
  try {
    const userId  = req.user._id;
    const isAdmin = req.user.role === 'admin';
    const id      = req.params.id;

    const booking = await Booking.findById(id);
    if (!booking)
      return res.status(404).json({ success: false, message: 'Booking not found' });

    if (!isAdmin && booking.user.toString() !== userId.toString())
      return res.status(403).json({ success: false, message: 'Forbidden' });

    if (booking.status !== 'Active')
      return res.status(400).json({ success: false, message: 'Only active bookings can be completed' });

    booking.end    = new Date();
    booking.status = 'Completed';
    const start         = booking.start || booking.createdAt;
    const durationHours = (booking.end.getTime() - new Date(start).getTime()) / 3600000;
    booking.amount      = Math.round(Math.max(0.1, durationHours) * 50 * 100) / 100;
    await booking.save();

    try {
      const session = await Session.findOne({
        $or: [
          { bookingId: booking._id },
          { vehiclePlate: booking.vehiclePlate.toUpperCase(), slot: booking.slot, status: 'Active' },
        ],
      });
      if (session) { session.end = booking.end; session.status = 'Completed'; session.totalFee = booking.amount; await session.save(); }
    } catch (e) { console.error('Failed to complete session:', e.message); }

    await Notification.create({
      user: booking.user,
      title: `Booking completed: ${booking.slot}`,
      body:  `Your booking for slot ${booking.slot} is completed. Total charge: PKR ${booking.amount}.`,
      meta:  { bookingId: booking._id },
    });

    try {
      await Vehicle.findOneAndUpdate(
        { user: booking.user, plate: booking.vehiclePlate.toUpperCase() },
        { status: 'Idle', lastSeen: new Date() }
      );
    } catch (e) { console.error('Failed to reset vehicle on complete:', e.message); }

    res.json({ success: true, data: booking.toObject() });

    // 🟢 Broadcast slot is now available to all connected users
    broadcastSlotUpdate({ slot: booking.slot, status: 'available' });

  } catch (err) { next(err); }
}