import bcrypt          from 'bcryptjs';
import * as userService from '../services/user.service.js';
import User             from '../models/user.model.js';

// ── Admin: list all users ─────────────────────────────────────
export async function getUsers(req, res, next) {
  try {
    const users = await userService.findAll();
    res.json({ success: true, data: users });
  } catch (err) { next(err); }
}

// ── Admin: create user ────────────────────────────────────────
export async function createUser(req, res, next) {
  try {
    if (!req.user || req.user.role !== 'admin')
      return res.status(403).json({ success: false, message: 'Forbidden: admin only' });
    const data = req.body || {};
    data.role  = data.role === 'admin' ? 'admin' : 'user';
    const user = await userService.create(data);
    res.status(201).json({ success: true, data: user });
  } catch (err) { next(err); }
}

// ── Admin: update user ────────────────────────────────────────
export async function updateUser(req, res, next) {
  try {
    if (!req.user || req.user.role !== 'admin')
      return res.status(403).json({ success: false, message: 'Forbidden: admin only' });
    const data = req.body || {};
    if (data.role) {
      const r = String(data.role).toLowerCase();
      data.role = r === 'admin' ? 'admin' : r === 'user' ? 'user' : undefined;
    }
    const user = await userService.update(req.params.id, data);
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
}

// ── Admin: delete user ────────────────────────────────────────
export async function deleteUser(req, res, next) {
  try {
    if (!req.user || req.user.role !== 'admin')
      return res.status(403).json({ success: false, message: 'Forbidden: admin only' });
    await userService.remove(req.params.id);
    res.json({ success: true, message: 'User deleted' });
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────
// GET /api/v1/users/me
// Returns own full profile including notifications + preferences
// ─────────────────────────────────────────────────────────────
export async function getMe(req, res, next) {
  try {
    const user = await User.findById(req.user._id).lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────
// PATCH /api/v1/users/me
// Update own profile fields (name, phone, company, address, jobTitle, avatar)
// ─────────────────────────────────────────────────────────────
export async function updateMe(req, res, next) {
  try {
    const allowed = ['name', 'phone', 'company', 'address', 'jobTitle', 'avatar'];
    const updates = {};

    for (const field of allowed) {
      if (req.body[field] !== undefined) {
        if (field === 'avatar') {
          const v = req.body.avatar;
          if (v === null || v === '') {
            updates.avatar = null;
          } else if (typeof v === 'string' && v.startsWith('data:image/')) {
            if (v.length > 2_800_000)
              return res.status(400).json({ success: false, message: 'Image too large. Max 2MB.' });
            updates.avatar = v;
          } else {
            return res.status(400).json({ success: false, message: 'Invalid image format' });
          }
        } else {
          const val = String(req.body[field]).trim();
          if (val) updates[field] = val;
        }
      }
    }

    if (Object.keys(updates).length === 0)
      return res.status(400).json({ success: false, message: 'Nothing to update' });

    const user = await User.findByIdAndUpdate(
      req.user._id, { $set: updates }, { new: true, runValidators: true }
    ).lean();

    res.json({ success: true, data: user });
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────
// PATCH /api/v1/users/me/password
// Change own password — requires current password verification
// ─────────────────────────────────────────────────────────────
export async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword)
      return res.status(400).json({ success: false, message: 'currentPassword and newPassword required' });
    if (newPassword.length < 8)
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });

    // Fetch with password (select: false by default)
    const user = await User.findById(req.user._id).select('+password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const match = await bcrypt.compare(currentPassword, user.password);
    if (!match)
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });

    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────
// PATCH /api/v1/users/me/notifications
// Update notification preferences
// ─────────────────────────────────────────────────────────────
export async function updateNotifications(req, res, next) {
  try {
    const allowed = ['email', 'push', 'sms', 'parkingAlerts', 'paymentReceipts', 'systemUpdates'];
    const updates = {};

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates[`notifications.${key}`] = Boolean(req.body[key]);
      }
    }

    if (Object.keys(updates).length === 0)
      return res.status(400).json({ success: false, message: 'Nothing to update' });

    const user = await User.findByIdAndUpdate(
      req.user._id, { $set: updates }, { new: true }
    ).lean();

    res.json({ success: true, data: user.notifications });
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────
// PATCH /api/v1/users/me/preferences
// Update UI preferences (language, timezone, dateFormat, currency, darkMode)
// ─────────────────────────────────────────────────────────────
export async function updatePreferences(req, res, next) {
  try {
    const allowed = ['language', 'timezone', 'dateFormat', 'currency', 'darkMode'];
    const updates = {};

    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates[`preferences.${key}`] = key === 'darkMode'
          ? Boolean(req.body[key])
          : String(req.body[key]).trim();
      }
    }

    if (Object.keys(updates).length === 0)
      return res.status(400).json({ success: false, message: 'Nothing to update' });

    const user = await User.findByIdAndUpdate(
      req.user._id, { $set: updates }, { new: true }
    ).lean();

    res.json({ success: true, data: user.preferences });
  } catch (err) { next(err); }
}