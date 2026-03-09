import Notification from '../models/notification.model.js';

export async function listNotifications(req, res, next) {
  try {
    const userId = req.user._id;
    const notifs = await Notification.find({ user: userId }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: notifs });
  } catch (err) {
    next(err);
  }
}

export async function markRead(req, res, next) {
  try {
    const userId = req.user._id;
    const id = req.params.id;
    const n = await Notification.findById(id);
    if (!n) return res.status(404).json({ success: false, message: 'Notification not found' });
    if (n.user.toString() !== userId.toString()) return res.status(403).json({ success: false, message: 'Forbidden' });
    n.read = true;
    await n.save();
    res.json({ success: true, data: n.toObject() });
  } catch (err) {
    next(err);
  }
}

export async function createNotification(req, res, next) {
  try {
    const { user, title, body, meta } = req.body;
    if (!user || !title || !body) return res.status(400).json({ success: false, message: 'user, title, body required' });
    const n = await Notification.create({ user, title, body, meta: meta || {} });
    res.status(201).json({ success: true, data: n });
  } catch (err) {
    next(err);
  }
}