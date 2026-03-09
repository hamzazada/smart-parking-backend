// backend/src/controllers/history.controller.js
import Booking from '../models/booking.model.js';

// ─────────────────────────────────────────────────────────────
// GET /api/v1/history
// Returns paginated booking history for logged-in user
// Query params:
//   ?status=Completed|Cancelled|Active|All  (default: All)
//   ?search=plate|slot
//   ?page=1&limit=8
//   ?sort=newest|oldest|amount_high|amount_low
// ─────────────────────────────────────────────────────────────
export async function getHistory(req, res, next) {
  try {
    const userId  = req.user._id;
    const isAdmin = req.user.role === 'admin';

    const {
      status = 'All',
      search = '',
      page   = 1,
      limit  = 8,
      sort   = 'newest',
    } = req.query;

    // ── Base filter ─────────────────────────────────────────
    const filter = isAdmin ? {} : { user: userId };

    if (status !== 'All') {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { vehiclePlate: { $regex: search, $options: 'i' } },
        { slot:         { $regex: search, $options: 'i' } },
      ];
    }

    // ── Sort ────────────────────────────────────────────────
    const sortMap = {
      newest:      { createdAt: -1 },
      oldest:      { createdAt:  1 },
      amount_high: { amount:    -1 },
      amount_low:  { amount:     1 },
    };
    const sortQuery = sortMap[sort] || sortMap.newest;

    // ── Query ───────────────────────────────────────────────
    const total    = await Booking.countDocuments(filter);
    const bookings = await Booking.find(filter)
      .populate('user', 'name email')
      .sort(sortQuery)
      .skip((+page - 1) * +limit)
      .limit(+limit)
      .lean();

    // ── Enrich each booking ─────────────────────────────────
    const enriched = bookings.map(b => {
      const start    = b.start || b.createdAt;
      const end      = b.end   || null;
      const diffMs   = end ? new Date(end) - new Date(start) : null;
      const durationMinutes = diffMs ? Math.floor(diffMs / 60000) : null;
      const durationLabel   = durationMinutes != null
        ? `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m`
        : b.status === 'Active' ? 'Ongoing' : '-';

      return {
        ...b,
        durationMinutes,
        durationLabel,
      };
    });

    // ── Summary stats ───────────────────────────────────────
    const [statsAgg] = await Booking.aggregate([
      { $match: isAdmin ? {} : { user: userId } },
      {
        $group: {
          _id:             null,
          totalBookings:   { $sum: 1 },
          totalSpent:      { $sum: '$amount' },
          completedCount:  { $sum: { $cond: [{ $eq: ['$status', 'Completed'] }, 1, 0] } },
          cancelledCount:  { $sum: { $cond: [{ $eq: ['$status', 'Cancelled'] }, 1, 0] } },
          activeCount:     { $sum: { $cond: [{ $eq: ['$status', 'Active']    }, 1, 0] } },
        },
      },
    ]) || [{}];

    res.json({
      success: true,
      data: enriched,
      pagination: {
        total,
        page:       +page,
        limit:      +limit,
        totalPages: Math.ceil(total / +limit),
      },
      stats: {
        totalBookings:  statsAgg?.totalBookings  || 0,
        totalSpent:     parseFloat((statsAgg?.totalSpent || 0).toFixed(2)),
        completedCount: statsAgg?.completedCount || 0,
        cancelledCount: statsAgg?.cancelledCount || 0,
        activeCount:    statsAgg?.activeCount    || 0,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────
// GET /api/v1/history/:id
// Get full details of one booking from history
// ─────────────────────────────────────────────────────────────
export async function getHistoryById(req, res, next) {
  try {
    const userId  = req.user._id;
    const isAdmin = req.user.role === 'admin';

    const booking = await Booking.findById(req.params.id)
      .populate('user', 'name email')
      .lean();

    if (!booking) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }

    if (!isAdmin && booking.user._id.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    // Enrich
    const diffMs = booking.end
      ? new Date(booking.end) - new Date(booking.start)
      : null;
    const durationMinutes = diffMs ? Math.floor(diffMs / 60000) : null;

    res.json({
      success: true,
      data: {
        ...booking,
        durationMinutes,
        durationLabel: durationMinutes != null
          ? `${Math.floor(durationMinutes / 60)}h ${durationMinutes % 60}m`
          : booking.status === 'Active' ? 'Ongoing' : '-',
      },
    });
  } catch (err) {
    next(err);
  }
}