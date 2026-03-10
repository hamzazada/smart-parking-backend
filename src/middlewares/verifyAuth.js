import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';

export async function verifyAuth(req, res, next) {
  try {
    let token = req.headers.authorization;
    console.log('🔐 AUTH HEADER:', token ? token.substring(0, 30) + '...' : 'MISSING');
    
    if (!token || !token.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Unauthorized: No token provided' });
    }
    
    token = token.split(' ')[1];
    const secret = process.env.JWT_SECRET || 'change-me-in-prod';
    console.log('🔑 JWT_SECRET used:', secret);
    console.log('🎫 Token first 20 chars:', token.substring(0, 20));
    
    const decoded = jwt.verify(token, secret);
    console.log('✅ Decoded:', decoded);

    const user = await User.findById(decoded.sub).select('-password');
    console.log('👤 User found:', user ? user.email : 'NOT FOUND');
    
    if (!user) {
      return res.status(401).json({ success: false, message: 'Unauthorized: User not found' });
    }

    req.user = user;
    next();
  } catch (err) {
    console.log('❌ JWT Error:', err.message);
    return res.status(401).json({ success: false, message: 'Unauthorized: Invalid token' });
  }
}