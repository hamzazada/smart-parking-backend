// backend/src/routes/v1/auth.routes.js
import express  from 'express';
import axios    from 'axios';
import { register, login, getMe, googleCallback, githubCallback } from '../../controllers/auth.controller.js';
import { verifyAuth } from '../../middlewares/verifyAuth.js';

const router = express.Router();

// ── Local auth ───────────────────────────────────────────────
router.post('/register', register);
router.post('/login',    login);
router.get ('/me',       verifyAuth, getMe);

// ─────────────────────────────────────────────────────────────
// GOOGLE OAUTH
// Step 1: redirect user to Google
// ─────────────────────────────────────────────────────────────
router.get('/google', (req, res) => {
  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID,
    redirect_uri:  process.env.GOOGLE_CALLBACK_URL,
    response_type: 'code',
    scope:         'openid email profile',
    access_type:   'offline',
    prompt:        'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// Step 2: Google redirects back here with ?code=
router.get('/google/callback', async (req, res, next) => {
  try {
    const { code } = req.query;
    if (!code) return res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_failed`);

    // Exchange code for tokens
    const tokenRes = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id:     process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri:  process.env.GOOGLE_CALLBACK_URL,
      grant_type:    'authorization_code',
    });

    // Get user info
    const infoRes = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenRes.data.access_token}` },
    });

    const { sub, name, email, picture } = infoRes.data;
    req.oauthUser = { name, email, providerId: sub, avatar: picture };
    await googleCallback(req, res, next);
  } catch (err) {
    console.error('Google OAuth error:', err.response?.data || err.message);
    res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_failed`);
  }
});

// ─────────────────────────────────────────────────────────────
// GITHUB OAUTH
// Step 1: redirect user to GitHub
// ─────────────────────────────────────────────────────────────
router.get('/github', (req, res) => {
  const params = new URLSearchParams({
    client_id:    process.env.GITHUB_CLIENT_ID,
    redirect_uri: process.env.GITHUB_CALLBACK_URL,
    scope:        'user:email',
  });
  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

// Step 2: GitHub redirects back here with ?code=
router.get('/github/callback', async (req, res, next) => {
  try {
    const { code } = req.query;
    if (!code) return res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_failed`);

    // Exchange code for access token
    const tokenRes = await axios.post(
      'https://github.com/login/oauth/access_token',
      {
        client_id:     process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri:  process.env.GITHUB_CALLBACK_URL,
      },
      { headers: { Accept: 'application/json' } }
    );

    const accessToken = tokenRes.data.access_token;

    // Get user profile
    const [profileRes, emailsRes] = await Promise.all([
      axios.get('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      axios.get('https://api.github.com/user/emails', {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
    ]);

    const profile  = profileRes.data;
    const primary  = emailsRes.data.find(e => e.primary && e.verified);
    const email    = primary?.email || profile.email;

    if (!email) return res.redirect(`${process.env.FRONTEND_URL}/login?error=no_email`);

    req.oauthUser = {
      name:       profile.name || profile.login,
      email,
      providerId: String(profile.id),
      avatar:     profile.avatar_url,
    };
    await githubCallback(req, res, next);
  } catch (err) {
    console.error('GitHub OAuth error:', err.response?.data || err.message);
    res.redirect(`${process.env.FRONTEND_URL}/login?error=oauth_failed`);
  }
});

export default router;
