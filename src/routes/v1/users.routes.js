// backend/src/routes/v1/users.routes.js
import express        from 'express';
import { verifyAuth } from '../../middlewares/verifyAuth.js';
import { isAdmin }    from '../../middlewares/isAdmin.js';
import {
  getUsers, createUser, updateUser, deleteUser,
  getMe, updateMe, changePassword,
  updateNotifications, updatePreferences,
} from '../../controllers/users.controller.js';

const router = express.Router();

// ── Own profile ───────────────────────────────────────────────
router.get   ('/me',                   verifyAuth, getMe);
router.patch ('/me',                   verifyAuth, updateMe);
router.patch ('/me/password',          verifyAuth, changePassword);
router.patch ('/me/notifications',     verifyAuth, updateNotifications);
router.patch ('/me/preferences',       verifyAuth, updatePreferences);

// ── Admin only ────────────────────────────────────────────────
router.get   ('/',       verifyAuth, isAdmin, getUsers);
router.post  ('/',       verifyAuth, isAdmin, createUser);
router.patch ('/:id',    verifyAuth, isAdmin, updateUser);
router.delete('/:id',    verifyAuth, isAdmin, deleteUser);

export default router;