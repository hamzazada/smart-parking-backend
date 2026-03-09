// backend/src/controllers/dashboard.controller.js
import Booking      from '../models/booking.model.js';
import Session      from '../models/session.model.js';
import Vehicle      from '../models/vehicle.model.js';
import User         from '../models/user.model.js';
import Notification from '../models/notification.model.js';

// ─────────────────────────────────────────────────────────────
// GET /api/v1/dashboard
// User:  their own stats + active bookings + recent history + slot map
// Admin: system-wide stats + all active sessions + recent activity
// ─────────────────────────────────────────────────────────────
export async function getDashboard(req, res, next) {
  try {
    const user    = req.user;
    const isAdmin = user.role === 'admin';

    if (isAdmin) return getAdminDashboard(req, res, next);
    return getUserDashboard(req, res, next);
  } catch (err) { next(err); }
}

// ── USER DASHBOARD ────────────────────────────────────────────
async function getUserDashboard(req, res, next) {
  try {
    const userId = req.user._id;
    const now    = new Date();

    // ── 1. Active bookings ───────────────────────────────────
    const activeBookings = await Booking.find({ user: userId, status: 'Active' })
      .sort({ createdAt: -1 })
      .lean();

    // Enrich with live duration + fee
    const enriched = activeBookings.map(b => {
      const start          = new Date(b.start);
      const durationMins   = Math.floor((now - start) / 60000);
      const durationHours  = durationMins / 60;
      const subtotal       = parseFloat((durationHours * 50).toFixed(2));
      const tax            = parseFloat((subtotal * 0.16).toFixed(2));
      const currentFee     = parseFloat((subtotal + tax).toFixed(2));
      return {
        _id:         b._id,
        slot:        b.slot,
        vehiclePlate: b.vehiclePlate,
        start:       b.start,
        durationMins,
        currentFee,
        status:      b.status,
      };
    });

    // ── 2. Stats: total spent, visits, avg duration ──────────
    const [completedBookings, amountAgg, durationAgg, pendingAgg] = await Promise.all([
      Booking.countDocuments({ user: userId, status: 'Completed' }),
      Booking.aggregate([
        { $match: { user: userId, status: 'Completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Booking.aggregate([
        { $match: { user: userId, status: 'Completed', end: { $exists: true, $ne: null } } },
        { $project: { mins: { $divide: [{ $subtract: ['$end', '$start'] }, 60000] } } },
        { $group: { _id: null, avg: { $avg: '$mins' } } },
      ]),
      // Pending = completed bookings with amount = 0 (not yet paid)
      Booking.aggregate([
        { $match: { user: userId, status: 'Completed', amount: 0 } },
        { $count: 'count' },
      ]),
    ]);

    const totalSpent      = amountAgg[0]?.total        || 0;
    const avgMins         = Math.round(durationAgg[0]?.avg || 0);
    const avgDuration     = avgMins > 0
      ? `${Math.floor(avgMins / 60)}h ${avgMins % 60}m`
      : '—';
    const pendingPayments = pendingAgg[0]?.count || 0;

    // ── 3. Recent history (last 5 completed) ─────────────────
    const recentHistory = await Booking.find({ user: userId, status: 'Completed' })
      .sort({ updatedAt: -1 })
      .limit(5)
      .lean();

    const history = recentHistory.map(b => {
      const dMins = b.end && b.start
        ? Math.floor((new Date(b.end) - new Date(b.start)) / 60000)
        : 0;
      return {
        _id:          b._id,
        slot:         b.slot,
        vehiclePlate: b.vehiclePlate,
        date:         b.start,
        duration:     dMins > 0 ? `${Math.floor(dMins / 60)}h ${dMins % 60}m` : '—',
        amount:       b.amount || 0,
        paid:         b.amount > 0,
      };
    });

    // ── 4. All slots (from active sessions) ──────────────────
    const allActive = await Session.find({ status: 'Active' }).lean();
    const occupiedSlots = new Set(allActive.map(s => s.slot));
    const TOTAL_SLOTS = ['A1','A2','A3','A4','A5','A6','B1','B2','B3','B4'];
    const slots = TOTAL_SLOTS.map(id => ({
      id,
      status: occupiedSlots.has(id) ? 'occupied' : 'vacant',
    }));

    // ── 5. Vehicles ───────────────────────────────────────────
    const vehicles = await Vehicle.find({ user: userId }).lean();

    res.json({
      success: true,
      data: {
        role: 'user',
        stats: {
          totalSpent,
          totalVisits:    completedBookings,
          avgDuration,
          pendingPayments,
          activeCount:    activeBookings.length,
          vehicleCount:   vehicles.length,
        },
        activeBookings: enriched,
        recentHistory:  history,
        slots,
      },
    });
  } catch (err) { next(err); }
}

// ── ADMIN DASHBOARD ───────────────────────────────────────────
async function getAdminDashboard(req, res, next) {
  try {
    const now       = new Date();
    const todayStart = new Date(now); todayStart.setHours(0,0,0,0);

    // ── 1. Core counts ────────────────────────────────────────
    const [
      totalUsers,
      activeSessions,
      vehiclesToday,
      revenueAgg,
      pendingPayments,
    ] = await Promise.all([
      User.countDocuments({ role: 'user' }),
      Session.countDocuments({ status: 'Active' }),
      Session.countDocuments({ createdAt: { $gte: todayStart } }),
      Booking.aggregate([
        { $match: { status: 'Completed', amount: { $gt: 0 }, updatedAt: { $gte: todayStart } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Booking.countDocuments({ status: 'Completed', amount: 0 }),
    ]);

    const revenueToday = revenueAgg[0]?.total || 0;

    // ── 2. Avg session duration today ────────────────────────
    const durAgg = await Session.aggregate([
      { $match: { status: 'Completed', end: { $exists: true }, createdAt: { $gte: todayStart } } },
      { $project: { mins: { $divide: [{ $subtract: ['$end', '$start'] }, 60000] } } },
      { $group: { _id: null, avg: { $avg: '$mins' } } },
    ]);
    const avgMins    = Math.round(durAgg[0]?.avg || 0);
    const avgStay    = avgMins > 0 ? `${Math.floor(avgMins/60)}h ${avgMins%60}m` : '—';

    // ── 3. Slot map ───────────────────────────────────────────
    const allActive  = await Session.find({ status: 'Active' })
      .populate('user', 'name')
      .lean();

    const occupiedMap = {};
    for (const s of allActive) {
      occupiedMap[s.slot] = {
        vehiclePlate: s.vehiclePlate,
        since:        s.start,
        durationMins: Math.floor((now - new Date(s.start)) / 60000),
        userName:     s.user?.name || '—',
      };
    }

    const TOTAL_SLOTS = ['A1','A2','A3','A4','A5','A6','B1','B2','B3','B4'];
    const slots = TOTAL_SLOTS.map(id => ({
      id,
      status: occupiedMap[id] ? 'occupied' : 'vacant',
      ...(occupiedMap[id] || {}),
    }));

    const occupiedCount = slots.filter(s => s.status === 'occupied').length;
    const vacantCount   = slots.filter(s => s.status === 'vacant').length;
    const occupancyRate = Math.round((occupiedCount / slots.length) * 100);

    // ── 4. Recent activity (last 10 sessions/bookings) ────────
    const recentSessions = await Session.find()
      .sort({ updatedAt: -1 })
      .limit(10)
      .populate('user', 'name')
      .lean();

    const recentActivity = recentSessions.map(s => ({
      _id:          s._id,
      type:         s.status === 'Active' ? 'entry' : 'exit',
      slot:         s.slot,
      vehiclePlate: s.vehiclePlate,
      userName:     s.user?.name || '—',
      time:         s.status === 'Active' ? s.start : s.end,
      status:       s.status,
    }));

    // ── 5. Revenue trend last 7 days ─────────────────────────
    const sevenDaysAgo = new Date(now - 7 * 86400000);
    const revenueTrend = await Booking.aggregate([
      { $match: { status: 'Completed', amount: { $gt: 0 }, createdAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id:   { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      success: true,
      data: {
        role: 'admin',
        stats: {
          totalUsers,
          activeSessions,
          vehiclesToday,
          revenueToday,
          pendingPayments,
          occupiedCount,
          vacantCount,
          occupancyRate,
          avgStay,
          totalSlots: slots.length,
        },
        slots,
        recentActivity,
        revenueTrend,
      },
    });
  } catch (err) { next(err); }
}