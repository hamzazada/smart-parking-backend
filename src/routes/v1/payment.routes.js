// backend/src/routes/v1/payment.routes.js
import express from 'express';
import { verifyAuth } from '../../middlewares/verifyAuth.js';
import { isAdmin }    from '../../middlewares/isAdmin.js';
import {
  getPaymentSession,
  validateDiscount,
  processPayment,
  getRecentPayments,
  getPaymentStats,
} from '../../controllers/payment.controller.js';

const router = express.Router();

router.get ('/recent',            verifyAuth,          getRecentPayments);
router.get ('/stats',             verifyAuth, isAdmin, getPaymentStats);
router.get ('/session/:bookingId',verifyAuth,          getPaymentSession);
router.post('/validate-discount', verifyAuth,          validateDiscount);
router.post('/process',           verifyAuth,          processPayment);

export default router;
