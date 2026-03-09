// backend/src/controllers/vehicles.controller.js
import Vehicle from '../models/vehicle.model.js';
import Session from '../models/session.model.js';

// ─────────────────────────────────────────────────────────────
// GET /api/v1/vehicles
// Returns user's vehicles with REAL-TIME active session status
// cross-checked from sessions collection (not just stored status)
// ─────────────────────────────────────────────────────────────
export async function listVehicles(req, res, next) {
  try {
    const userId = req.user._id;

    // 1. Get vehicles
    const vehicles = await Vehicle.find({ user: userId })
      .sort({ createdAt: -1 })
      .lean();

    // 2. Get ALL active sessions for this user in one query
    const activeSessions = await Session.find({
      user:   userId,
      status: 'Active',
    }).lean();

    // 3. Build a map: plate → session
    const activeMap = {};
    activeSessions.forEach(s => {
      activeMap[s.vehiclePlate.toUpperCase()] = s;
    });

    // 4. Fix any stale vehicle statuses in DB silently
    const staleVehicles = vehicles.filter(v => {
      const hasSession = !!activeMap[v.plate.toUpperCase()];
      return (v.status === 'Active' && !hasSession) ||
             (v.status !== 'Active' && hasSession);
    });

    if (staleVehicles.length > 0) {
      await Promise.all(staleVehicles.map(v => {
        const hasSession = !!activeMap[v.plate.toUpperCase()];
        return Vehicle.findByIdAndUpdate(v._id, {
          status: hasSession ? 'Active' : 'Idle',
        });
      }));
    }

    // 5. Return vehicles with REAL status + session info
    const enriched = vehicles.map(v => {
      const session = activeMap[v.plate.toUpperCase()];
      const isActive = !!session;

      let sessionInfo = null;
      if (session) {
        const durationMins = Math.floor((Date.now() - new Date(session.start)) / 60000);
        const fee = parseFloat(((durationMins / 60) * 50 * 1.16).toFixed(2));
        sessionInfo = {
          sessionId:     session._id,
          slot:          session.slot || '—',
          startTime:     session.start,
          durationMins,
          currentFee:    fee,
        };
      }

      return {
        ...v,
        status:      isActive ? 'Active' : 'Idle',
        sessionInfo,
      };
    });

    res.json({ success: true, data: enriched });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────
// POST /api/v1/vehicles
// ─────────────────────────────────────────────────────────────
export async function createVehicle(req, res, next) {
  try {
    const userId = req.user._id;
    const { plate, model } = req.body;

    if (!plate) {
      return res.status(400).json({ success: false, message: 'plate is required' });
    }

    const exists = await Vehicle.findOne({
      user:  userId,
      plate: plate.toUpperCase().trim(),
    });

    if (exists) {
      return res.status(409).json({
        success: false,
        message: `Vehicle ${plate.toUpperCase()} is already registered`,
      });
    }

    const vehicle = await Vehicle.create({
      user:   userId,
      plate:  plate.toUpperCase().trim(),
      model:  model?.trim() || '',
      status: 'Idle',
    });

    res.status(201).json({ success: true, data: vehicle });
  } catch (err) {
    next(err);
  }
}

// ─────────────────────────────────────────────────────────────
// DELETE /api/v1/vehicles/:id
// ─────────────────────────────────────────────────────────────
export async function deleteVehicle(req, res, next) {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const vehicle = await Vehicle.findById(id);
    if (!vehicle) {
      return res.status(404).json({ success: false, message: 'Vehicle not found' });
    }

    if (vehicle.user.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    // Double-check: is there actually an active session for this plate?
    const activeSession = await Session.findOne({
      user:         userId,
      vehiclePlate: vehicle.plate.toUpperCase(),
      status:       'Active',
    });

    if (activeSession) {
      return res.status(400).json({
        success: false,
        message: 'Cannot remove a vehicle that is currently parked. End the session first.',
      });
    }

    await vehicle.deleteOne();
    res.json({ success: true, message: 'Vehicle removed' });
  } catch (err) {
    next(err);
  }
}