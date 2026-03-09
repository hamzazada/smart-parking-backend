// backend/src/controllers/auth.controller.js
import bcrypt        from 'bcryptjs';
import jwt           from 'jsonwebtoken';
import User          from '../models/user.model.js';

const JWT_SECRET  = process.env.JWT_SECRET  || 'changeme';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';

function signToken(user) {
  return jwt.sign(
    { sub: user._id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
}

function safeUser(u) {
  const { password, __v, ...rest } = u;
  return rest;
}

// ─────────────────────────────────────────────────────────────
// POST /api/v1/auth/register
// ─────────────────────────────────────────────────────────────
export async function register(req, res, next) {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ success: false, message: 'name, email and password are required' });
    if (password.length < 8)
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });

    const exists = await User.findOne({ email: email.toLowerCase().trim() });
    if (exists)
      return res.status(409).json({ success: false, message: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 12);
    const user   = await User.create({
      name:     name.trim(),
      email:    email.toLowerCase().trim(),
      password: hashed,
      provider: 'local',
    });

    const token = signToken(user);
    res.status(201).json({ success: true, token, data: safeUser(user.toJSON()) });
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────
// POST /api/v1/auth/login
// ─────────────────────────────────────────────────────────────
export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ success: false, message: 'email and password are required' });

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
    if (!user)
      return res.status(401).json({ success: false, message: 'Invalid email or password' });

    // OAuth-only account trying to log in with password
    if (!user.password)
      return res.status(401).json({ success: false, message: `This account uses ${user.provider} login. Please sign in with ${user.provider}.` });

    if (user.status === 'Inactive')
      return res.status(403).json({ success: false, message: 'Account is deactivated. Contact support.' });

    const match = await bcrypt.compare(password, user.password);
    if (!match)
      return res.status(401).json({ success: false, message: 'Invalid email or password' });

    const token = signToken(user);
    res.json({ success: true, token, data: safeUser(user.toJSON()) });
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────
// GET /api/v1/auth/me
// ─────────────────────────────────────────────────────────────
export async function getMe(req, res, next) {
  try {
    const user = await User.findById(req.user._id).lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: safeUser(user) });
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────
// GET /api/v1/auth/google          → redirect to Google
// GET /api/v1/auth/google/callback → Google redirects here
// ─────────────────────────────────────────────────────────────
export async function googleCallback(req, res, next) {
  try {
    // req.oauthUser is set by the OAuth middleware in auth.routes.js
    const { name, email, providerId, avatar } = req.oauthUser;

    let user = await User.findOne({ $or: [{ provider: 'google', providerId }, { email }] });

    if (!user) {
      user = await User.create({ name, email, provider: 'google', providerId, avatar, status: 'Active' });
    } else if (user.provider === 'local') {
      // Existing local account — link it
      user.provider   = 'google';
      user.providerId = providerId;
      if (!user.avatar && avatar) user.avatar = avatar;
      await user.save();
    }

    if (user.status === 'Inactive')
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=account_disabled`);

    const token = signToken(user);
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}`);
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────
// GET /api/v1/auth/github/callback
// ─────────────────────────────────────────────────────────────
export async function githubCallback(req, res, next) {
  try {
    const { name, email, providerId, avatar } = req.oauthUser;

    let user = await User.findOne({ $or: [{ provider: 'github', providerId }, { email }] });

    if (!user) {
      user = await User.create({ name, email, provider: 'github', providerId, avatar, status: 'Active' });
    } else if (user.provider === 'local') {
      user.provider   = 'github';
      user.providerId = providerId;
      if (!user.avatar && avatar) user.avatar = avatar;
      await user.save();
    }

    if (user.status === 'Inactive')
      return res.redirect(`${process.env.FRONTEND_URL}/login?error=account_disabled`);

    const token = signToken(user);
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}`);
  } catch (err) { next(err); }
}
