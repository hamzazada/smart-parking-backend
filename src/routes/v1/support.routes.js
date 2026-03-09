// backend/src/routes/v1/support.routes.js
import express from 'express';
import { verifyAuth } from '../../middlewares/verifyAuth.js';
import { isAdmin }    from '../../middlewares/isAdmin.js';
import {
  getFaqs,
  listTickets,
  createTicket,
  getTicketById,
  deleteTicket,
  adminListTickets,
  updateTicketStatus,
  replyToTicket,
} from '../../controllers/support.controller.js';

const router = express.Router();

// ── Public ───────────────────────────────────────────────────
router.get('/faqs', getFaqs);

// ── Admin-only (MUST be before /:id routes) ──────────────────
router.get('/admin',        verifyAuth, isAdmin, adminListTickets);
router.patch('/:id/status', verifyAuth, isAdmin, updateTicketStatus);
router.post('/:id/reply',   verifyAuth, isAdmin, replyToTicket);
router.delete('/:id',       verifyAuth, isAdmin, deleteTicket);

// ── User routes ──────────────────────────────────────────────
router.get('/',    verifyAuth, listTickets);
router.post('/',   verifyAuth, createTicket);
router.get('/:id', verifyAuth, getTicketById);

export default router;