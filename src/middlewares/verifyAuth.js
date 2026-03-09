import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';

export async function verifyAuth(req, res, next) {
  try {
    let token = req.headers.authorization;
    if (!token || !token.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Unauthorized: No token provided' });
    }
    
    token = token.split(' ')[1];
    const secret = process.env.JWT_SECRET || 'change-me-in-prod';
    const decoded = jwt.verify(token, secret);

    // FIX: Explicitly exclude password
    const user = await User.findById(decoded.sub).select('-password');
    
    if (!user) {
      return res.status(401).json({ success: false, message: 'Unauthorized: User not found' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Unauthorized: Invalid token' });
  }
}