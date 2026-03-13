import express from 'express';
import {
  listBookings,
  createBooking,
  checkInBooking,
  cancelBooking,
  completeBooking,
  anprCheckIn,
} from '../../controllers/bookings.controller.js';
import { verifyAuth } from '../../middlewares/verifyAuth.js';

const router = express.Router();

router.get('/',                     verifyAuth, listBookings);
router.post('/',                    verifyAuth, createBooking);
router.patch('/:id/checkin',        verifyAuth, checkInBooking);   // manual check-in
router.patch('/:id/cancel',         verifyAuth, cancelBooking);
router.patch('/:id/complete',       verifyAuth, completeBooking);
router.post('/anpr-checkin',        verifyAuth, anprCheckIn);      // Pi ANPR auto check-in

export default router;