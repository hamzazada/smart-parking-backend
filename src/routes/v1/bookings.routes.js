import express from 'express';
import { listBookings, createBooking, cancelBooking, completeBooking } from '../../controllers/bookings.controller.js';
import { verifyAuth } from '../../middlewares/verifyAuth.js';

const router = express.Router();

router.get('/', verifyAuth, listBookings);
router.post('/', verifyAuth, createBooking);
router.patch('/:id/cancel', verifyAuth, cancelBooking);
router.patch('/:id/complete', verifyAuth, completeBooking);

export default router;