// backend/src/routes/v1/dashboard.routes.js
import express           from 'express';
import { verifyAuth }    from '../../middlewares/verifyAuth.js';
import { getDashboard }  from '../../controllers/dashboard.controller.js';

const router = express.Router();

// GET /api/v1/dashboard
router.get('/', verifyAuth, getDashboard);

export default router;