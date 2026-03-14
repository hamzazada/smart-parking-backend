// backend/src/controllers/payment.controller.js
import Booking  from '../models/booking.model.js';
import Session  from '../models/session.model.js';

const FEE_PER_HOUR = 50;
const TAX_RATE     = 0.16;
const MIN_DURATION = 0.1;

// GET /api/v1/payments/session/:bookingId
export async function getPaymentSession(req, res, next) {
  try {
    const booking = await Booking.findById(req.params.bookingId).lean();
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found' });
    if (booking.user.toString() !== req.user._id.toString() && req.user.role !== 'admin')
      return res.status(403).json({ success: false, message: 'Forbidden' });
    if (booking.status !== 'Completed')
      return res.status(400).json({ success: false, message: 'Booking is not completed yet' });

    // ✅ Use checkInTime for billing, fallback to start for old bookings
    const start     = new Date(booking.checkInTime || booking.start);
    const end       = booking.end ? new Date(booking.end) : new Date();
    const durationH = Math.max(MIN_DURATION, (end - start) / 3600000);
    const subtotal  = parseFloat((durationH * FEE_PER_HOUR).toFixed(2));
    const tax       = parseFloat((subtotal * TAX_RATE).toFixed(2));
    const total     = parseFloat((subtotal + tax).toFixed(2));

    res.json({ success: true, data: {
      booking, durationH: parseFloat(durationH.toFixed(2)),
      durationLabel: durationH >= 1 ? `${Math.floor(durationH)}h ${Math.floor((durationH % 1) * 60)}m` : `${Math.floor(durationH * 60)}m`,
      subtotal, taxAmount: tax, total,
      baseRate: FEE_PER_HOUR, taxRate: TAX_RATE,
      entryTime:   new Date(booking.checkInTime || booking.start).toLocaleString('en-PK'),
      currentTime: end.toLocaleString('en-PK'),
      durationHours: durationH,
    }});
  } catch(err) { next(err); }
}

// POST /api/v1/payments/validate-discount
export async function validateDiscount(req, res, next) {
  try {
    const { code } = req.body;
    const discounts = { 'SMART10': 10, 'PARK20': 20, 'VIP30': 30 };
    const pct = discounts[code?.toUpperCase()];
    if (!pct) return res.status(400).json({ success: false, message: 'Invalid discount code' });
    res.json({ success: true, data: { code: code.toUpperCase(), discountPercent: pct, message: `${pct}% discount applied` } });
  } catch(err) { next(err); }
}

// POST /api/v1/payments/process
export async function processPayment(req, res, next) {
  try {
    const { bookingId, discountCode, method, amountReceived } = req.body;

    const booking = await Booking.findById(bookingId);
    if (!booking)
      return res.status(404).json({ success: false, message: 'Booking not found' });

    if (booking.user.toString() !== req.user._id.toString() && req.user.role !== 'admin')
      return res.status(403).json({ success: false, message: 'Forbidden' });

    if (booking.status !== 'Completed')
      return res.status(400).json({ success: false, message: 'Booking must be completed before payment' });

    // ✅ FIXED: Don't check booking.amount > 0 as "already paid"
    // completeBooking sets amount during completion — that's correct
    // Only block if payment was explicitly recorded (paid flag)
    if (booking.paid === true)
      return res.status(400).json({ success: false, message: 'Already paid' });

    // ✅ Fee from checkInTime, not booking.start
    const start     = new Date(booking.checkInTime || booking.start);
    const end       = booking.end ? new Date(booking.end) : new Date();
    const durationH = Math.max(MIN_DURATION, (end - start) / 3600000);
    const subtotal  = durationH * FEE_PER_HOUR;
    const tax       = subtotal * TAX_RATE;
    let   total     = subtotal + tax;
    let   discount  = 0;

    const discounts = { 'SMART10': 10, 'PARK20': 20, 'VIP30': 30 };
    if (discountCode) {
      const pct = discounts[discountCode.toUpperCase()];
      if (pct) { discount = total * (pct / 100); total -= discount; }
    }

    total = parseFloat(total.toFixed(2));

    // ✅ Mark as paid so duplicate payment is blocked
    booking.amount = total;
    booking.paid   = true;
    await booking.save();

    try {
      await Session.findOneAndUpdate(
        { bookingId: booking._id },
        { status: 'Completed', end: booking.end || new Date(), totalFee: total }
      );
    } catch {}

    res.json({ success: true, data: {
      bookingId:    booking._id,
      amount:       total,
      discount:     parseFloat(discount.toFixed(2)),
      vehiclePlate: booking.vehiclePlate,
      slot:         booking.slot,
      method:       method || 'Cash',
      paidAt:       new Date(),
    }});

  } catch(err) { next(err); }
}

// GET /api/v1/payments/recent
export async function getRecentPayments(req, res, next) {
  try {
    const isAdmin = req.user.role === 'admin';
    const filter  = isAdmin
      ? { status: 'Completed', paid: true }
      : { user: req.user._id, status: 'Completed', paid: true };
    const limit = isAdmin ? 50 : 10;
    const recent = await Booking.find(filter)
      .populate('user', 'name email')
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean();
    const data = recent.map(b => {
      const start = b.checkInTime || b.start;
      const mins  = b.end ? Math.floor((new Date(b.end) - new Date(start)) / 60000) : 0;
      const diff  = b.end ? Date.now() - new Date(b.end).getTime() : null;
      let timeAgo = '';
      if (diff !== null) {
        const m = Math.floor(diff / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24);
        timeAgo = d > 0 ? `${d}d ago` : h > 0 ? `${h}h ago` : m > 0 ? `${m}m ago` : 'Just now';
      }
      return {
        bookingId:    b._id,
        vehiclePlate: b.vehiclePlate,
        slot:         b.slot,
        amount:       b.amount || 0,
        durationMins: mins,
        timeAgo,
        paidAt:       b.end,
        userName:     b.user?.name  || '—',
        userEmail:    b.user?.email || '—',
      };
    });
    res.json({ success: true, data });
  } catch(err) { next(err); }
}

// GET /api/v1/payments/stats (admin only)
export async function getPaymentStats(req, res, next) {
  try {
    const now        = new Date();
    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [todayAgg, monthAgg, totalAgg, countToday] = await Promise.all([
      Booking.aggregate([{ $match: { status: 'Completed', paid: true, updatedAt: { $gte: todayStart } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Booking.aggregate([{ $match: { status: 'Completed', paid: true, updatedAt: { $gte: monthStart } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Booking.aggregate([{ $match: { status: 'Completed', paid: true } },                                   { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
      Booking.countDocuments({ status: 'Completed', paid: true, updatedAt: { $gte: todayStart } }),
    ]);
    res.json({ success: true, data: {
      today:             todayAgg[0]?.total  || 0,
      month:             monthAgg[0]?.total  || 0,
      total:             totalAgg[0]?.total  || 0,
      totalTransactions: totalAgg[0]?.count  || 0,
      todayTransactions: countToday,
    }});
  } catch(err) { next(err); }
}