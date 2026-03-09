import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET || 'your_secret_key';
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export const signToken = (user) =>
  jwt.sign(
    { id: user._id, role: user.role },
    SECRET,
    { expiresIn: EXPIRES_IN }
  );

export const verifyToken = (token) => jwt.verify(token, SECRET);