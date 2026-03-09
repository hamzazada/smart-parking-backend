// backend/src/routes/v1/history.routes.js
import express from 'express';
import { verifyAuth } from '../../middlewares/verifyAuth.js';
import { getHistory, getHistoryById } from '../../controllers/history.controller.js';

const router = express.Router();

// GET /api/v1/history?status=All&search=&page=1&limit=8&sort=newest
router.get('/',    verifyAuth, getHistory);

// GET /api/v1/history/:id
router.get('/:id', verifyAuth, getHistoryById);

export default router;