// backend/src/routes/v1/analytics.routes.js
import express from 'express';
import { verifyAuth } from '../../middlewares/verifyAuth.js';
import { getAnalytics } from '../../controllers/analytics.controller.js';

const router = express.Router();

// GET /api/v1/analytics?range=7d|30d|90d|all
router.get('/', verifyAuth, getAnalytics);

export default router;