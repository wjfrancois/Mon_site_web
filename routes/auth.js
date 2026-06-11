require('dotenv').config();
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../database');

const JWT_SECRET = process.env.JWT_SECRET || 'jwt_fallback_secret';
const JWT_REFRESH = process.env.JWT_REFRESH_SECRET || 'jwt_refresh_fallback';

function makeAccessToken(user, tenant) {
  return jwt.sign(
    { userId: user.id, tenantId: tenant.id, role: user.role, plan: tenant.plan, slug: tenant.slug },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
}

function makeRefreshToken() {
  return crypto.randomBytes(40).toString('hex');
}

// POST /api/auth/login
router.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });

  const user = await db.prepare('SELECT u.*, t.id as t_id FROM users u JOIN tenants t ON u.tenant_id = t.id WHERE u.email = ? AND u.active = 1').get(email);
  if (!user) {
    await new Promise(r => setTimeout(r, 600));
    return res.status(401).json({ error: 'Identifiants incorrects' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    await new Promise(r => setTimeout(r, 600));
    return res.status(401).json({ error: 'Identifiants incorrects' });
  }

  // Reconstruire les objets séparés
  const tenant = await db.prepare('SELECT * FROM tenants WHERE id = ?').get(user.tenant_id);
  const accessToken = makeAccessToken(user, tenant);
  const refreshRaw = makeRefreshToken();
  const refreshHash = crypto.createHash('sha256').update(refreshRaw).digest('hex');
  const expiresAt = new Date(Date.now() + 30*24*60*60*1000).toISOString();

  // Supprimer anciens tokens de cet user
  await db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(user.id);
  await db.prepare('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)').run(user.id, refreshHash, expiresAt);

  res.json({
    accessToken,
    refreshToken: refreshRaw,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name, plan: tenant.plan, plan_status: tenant.plan_status, trial_ends_at: tenant.trial_ends_at }
  });
});

// POST /api/auth/refresh
router.post('/api/auth/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token requis' });

  const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
  const stored = await db.prepare('SELECT rt.*, u.tenant_id FROM refresh_tokens rt JOIN users u ON rt.user_id = u.id WHERE rt.token_hash = ?').get(hash);

  if (!stored || new Date(stored.expires_at) < new Date()) {
    return res.status(401).json({ error: 'Refresh token invalide ou expiré' });
  }

  const tenant = await db.prepare('SELECT * FROM tenants WHERE id = ?').get(stored.tenant_id);
  const user = await db.prepare('SELECT * FROM users WHERE id = ?').get(stored.user_id);
  const accessToken = makeAccessToken(user, tenant);
  res.json({ accessToken });
});

// POST /api/auth/logout
router.post('/api/auth/logout', async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    await db.prepare('DELETE FROM refresh_tokens WHERE token_hash = ?').run(hash);
  }
  res.json({ success: true });
});

// Compatibilité legacy : POST /login redirige vers JWT
router.post('/login', async (req, res) => {
  const { password, email } = req.body;
  // Support both old (password only) and new (email+password) forms
  const emailToUse = email || (process.env.EMAIL_USER || 'admin@fenixbarbier.ca');
  try {
    const user = await db.prepare('SELECT * FROM users WHERE email = ? AND active = 1').get(emailToUse);
    if (!user) return res.status(401).json({ error: 'Identifiants incorrects' });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Mot de passe incorrect' });
    const tenant = await db.prepare('SELECT * FROM tenants WHERE id = ?').get(user.tenant_id);
    const accessToken = makeAccessToken(user, tenant);
    const refreshRaw = makeRefreshToken();
    const refreshHash = crypto.createHash('sha256').update(refreshRaw).digest('hex');
    const expiresAt = new Date(Date.now() + 30*24*60*60*1000).toISOString();
    await db.prepare('DELETE FROM refresh_tokens WHERE user_id = ?').run(user.id);
    await db.prepare('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)').run(user.id, refreshHash, expiresAt);
    res.json({ success: true, accessToken, refreshToken: refreshRaw, tenant: { slug: tenant.slug } });
  } catch(e) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/logout', (req, res) => {
  req.session?.destroy?.(() => {});
  res.json({ success: true });
});
router.get('/logout', (req, res) => {
  req.session?.destroy?.(() => {});
  res.redirect('/login');
});

module.exports = router;
