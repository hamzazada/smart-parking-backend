import { verifyToken } from '../utils/jwt.utils.js';
import { sendError } from '../utils/response.utils.js';
import User from '../models/user.model.js';

const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return sendError(res, 'No token provided. Please log in.', 401);
    }

    const token = authHeader.split(' ')[1];

    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (err) {
      const message =
        err.name === 'TokenExpiredError'
          ? 'Session expired. Please log in again.'
          : 'Invalid token. Please log in again.';
      return sendError(res, message, 401);
    }

    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return sendError(res, 'User no longer exists.', 401);
    }
    if (!user.isActive) {
      return sendError(res, 'Account has been deactivated.', 401);
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
};

const restrictTo = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return sendError(res, 'You do not have permission to perform this action.', 403);
  }
  next();
};

export { protect, restrictTo };