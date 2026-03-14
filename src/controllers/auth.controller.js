// backend/src/controllers/auth.controller.js
import bcrypt        from 'bcryptjs';
import jwt           from 'jsonwebtoken';
import crypto        from 'crypto';
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
// GET /api/v1/auth/google/callback
// ─────────────────────────────────────────────────────────────
export async function googleCallback(req, res, next) {
  try {
    const { name, email, providerId, avatar } = req.oauthUser;

    let user = await User.findOne({ $or: [{ provider: 'google', providerId }, { email }] });

    if (!user) {
      user = await User.create({ name, email, provider: 'google', providerId, avatar, status: 'Active' });
    } else if (user.provider === 'local') {
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

// ─────────────────────────────────────────────────────────────
// POST /api/v1/auth/forgot-password
// ─────────────────────────────────────────────────────────────
export async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;
    if (!email)
      return res.status(400).json({ success: false, message: 'Email is required' });

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    // Always return success — don't reveal if email exists (security)
    if (!user)
      return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });

    // OAuth-only users have no password to reset
    if (user.provider !== 'local')
      return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });

    // Generate secure token valid for 1 hour
    const token   = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000);

    user.resetToken       = token;
    user.resetTokenExpiry = expires;
    await user.save();

    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

    // ── Send email via Resend ──────────────────────────────
    try {
      const { Resend } = await import('resend');
      const resend     = new Resend(process.env.RESEND_API_KEY);

      await resend.emails.send({
        from:    'Smart Parking <onboarding@resend.dev>',
        to:      user.email,
        subject: 'Reset your Smart Parking password',
        html: `
          <div style="font-family:monospace;background:#0a0e1a;color:#fff;padding:32px;border-radius:16px;max-width:480px;margin:0 auto">
            <div style="width:48px;height:48px;background:linear-gradient(135deg,#06b6d4,#3b82f6);border-radius:12px;display:inline-flex;align-items:center;justify-content:center;font-weight:900;font-size:18px;margin-bottom:24px">SP</div>
            <h2 style="color:#fff;margin:0 0 8px;font-size:20px">Password Reset</h2>
            <p style="color:#94a3b8;font-size:14px;margin:0 0 8px">Hi ${user.name},</p>
            <p style="color:#94a3b8;font-size:14px;margin:0 0 24px">Click the button below to reset your password. This link expires in <strong style="color:#fff">1 hour</strong>.</p>
            <a href="${resetUrl}"
              style="display:inline-block;background:linear-gradient(135deg,#06b6d4,#3b82f6);color:#fff;font-weight:700;padding:14px 28px;border-radius:12px;text-decoration:none;font-size:14px">
              Reset Password →
            </a>
            <p style="color:#475569;font-size:12px;margin-top:24px">If you didn't request this, you can safely ignore this email.</p>
            <p style="color:#334155;font-size:11px;margin-top:4px">Or copy this link: ${resetUrl}</p>
          </div>
        `,
      });
    } catch (mailErr) {
      console.error('Failed to send reset email:', mailErr.message);
    }

    res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
  } catch (err) { next(err); }
}

// ─────────────────────────────────────────────────────────────
// POST /api/v1/auth/reset-password
// ─────────────────────────────────────────────────────────────
export async function resetPassword(req, res, next) {
  try {
    const { token, password } = req.body;

    if (!token || !password)
      return res.status(400).json({ success: false, message: 'Token and password are required' });
    if (password.length < 8)
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });

    // Find user with valid non-expired token
    const user = await User.findOne({
      resetToken:       token,
      resetTokenExpiry: { $gt: new Date() },
    }).select('+password');

    if (!user)
      return res.status(400).json({ success: false, message: 'Invalid or expired reset link. Please request a new one.' });

    // Hash new password and clear reset token
    user.password         = await bcrypt.hash(password, 12);
    user.resetToken       = undefined;
    user.resetTokenExpiry = undefined;
    await user.save();

    res.json({ success: true, message: 'Password reset successfully. You can now sign in.' });
  } catch (err) { next(err); }
}