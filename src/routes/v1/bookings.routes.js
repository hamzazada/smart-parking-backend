import express from 'express';
import {
  listBookings,
  createBooking,
  checkInBooking,
  cancelBooking,
  completeBooking,
  anprCheckIn,
  getReservedSlots,
} from '../../controllers/bookings.controller.js';
import { verifyAuth } from '../../middlewares/verifyAuth.js';

const router = express.Router();

// ⚠️ specific routes MUST come before /:id routes
router.get('/reserved-slots',       verifyAuth, getReservedSlots);  // all reserved slots (cross-user)
router.get('/',                     verifyAuth, listBookings);
router.post('/',                    verifyAuth, createBooking);
router.post('/anpr-checkin',        verifyAuth, anprCheckIn);
router.patch('/:id/checkin',        verifyAuth, checkInBooking);
router.patch('/:id/cancel',         verifyAuth, cancelBooking);
router.patch('/:id/complete',       verifyAuth, completeBooking);

export default router;