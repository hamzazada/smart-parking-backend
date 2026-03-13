// backend/src/routes/v1/sessions.routes.js
import express from 'express';
import { verifyAuth } from '../../middlewares/verifyAuth.js';
import { isAdmin } from '../../middlewares/isAdmin.js';
import {
  listActiveSessions,
  getOccupiedSlots,
  createSession,
  getSessionById,
  updateSession,
  completeSession,
  reopenSession,
  extendSession,
  listAllSessions,
} from '../../controllers/sessions.controller.js';

const router = express.Router();

// ── User routes ──────────────────────────────────────────────

// ✅ GET /api/v1/sessions/occupied-slots
// Returns list of ALL occupied slot IDs from ALL users
// Used by book page so every user sees which slots are taken
router.get('/occupied-slots', verifyAuth, getOccupiedSlots);

// GET  /api/v1/sessions/active  → logged-in user's active sessions only
router.get('/active', verifyAuth, listActiveSessions);

// GET  /api/v1/sessions → admin: all | user: their own
router.get('/', verifyAuth, listAllSessions);

// POST /api/v1/sessions → start a new session
router.post('/', verifyAuth, createSession);

// GET  /api/v1/sessions/:id → get one session (owner or admin)
router.get('/:id', verifyAuth, getSessionById);

// PATCH /api/v1/sessions/:id → update vehiclePlate / slot
router.patch('/:id', verifyAuth, updateSession);

// POST /api/v1/sessions/:id/complete → end a session
router.post('/:id/complete', verifyAuth, completeSession);

// POST /api/v1/sessions/:id/reopen → restore session to Active
router.post('/:id/reopen', verifyAuth, reopenSession);

// POST /api/v1/sessions/:id/extend → extend active session
router.post('/:id/extend', verifyAuth, extendSession);

// ── Admin-only ───────────────────────────────────────────────
router.delete('/:id', verifyAuth, isAdmin, async (req, res, next) => {
  try {
    const { default: Session } = await import('../../models/session.model.js');
    const session = await Session.findByIdAndDelete(req.params.id);
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    res.json({ success: true, message: 'Session deleted' });
  } catch (err) { next(err); }
});

export default router;
