import express from 'express';
import { listNotifications, markRead, createNotification } from '../../controllers/notifications.controller.js';
import { verifyAuth } from '../../middlewares/verifyAuth.js';

const router = express.Router();

// list user's notifications
router.get('/', verifyAuth, listNotifications);
// mark as read
router.patch('/:id/read', verifyAuth, markRead);
// create (admin or tests) - protected for now
router.post('/', verifyAuth, createNotification);

export default router;