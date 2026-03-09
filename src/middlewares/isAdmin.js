// backend/src/middlewares/isAdmin.js
export function isAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Forbidden: admin only' });
  }
  next();
}
