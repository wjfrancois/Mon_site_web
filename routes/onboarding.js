const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../database');

router.post('/register', async (req, res) => {
  const { shopName, ownerName, email, password, plan = 'starter', phone = '', address = '' } = req.body;
  if (!shopName || !ownerName || !email || !password) return res.status(400).json({ error: 'Tous les champs sont requis' });
  if (password.length < 6) return res.status(400).json({ error: 'Mot de passe trop court (6 caractères min)' });

  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existingUser) return res.status(409).json({ error: 'Un compte avec cet email existe déjà' });

  // Générer un slug unique
  let slug = shopName.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
  let attempt = 0;
  while (db.prepare('SELECT id FROM tenants WHERE slug = ?').get(slug + (attempt > 0 ? `-${attempt}` : ''))) attempt++;
  if (attempt > 0) slug += `-${attempt}`;

  const trialEnd = new Date(Date.now() + 30*24*60*60*1000).toISOString().slice(0,10);
  const hash = await bcrypt.hash(password, 10);

  const t = db.prepare(`INSERT INTO tenants (slug, name, email, phone, address, plan, plan_status, trial_ends_at) VALUES (?, ?, ?, ?, ?, ?, 'trialing', ?)`).run(slug, shopName, email, phone, address, plan, trialEnd);
  const tenantId = t.lastInsertRowid;

  db.prepare('INSERT INTO users (tenant_id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)').run(tenantId, email, hash, ownerName, 'owner');

  // Seed services de base pour le nouveau tenant
  const insertService = db.prepare('INSERT INTO services (name, duration, price, description, tenant_id) VALUES (?, ?, ?, ?, ?)');
  insertService.run('Coupe classique', 30, 25, 'Coupe de cheveux avec finition', tenantId);
  insertService.run('Coupe + Barbe', 45, 40, 'Coupe + taille de barbe', tenantId);
  insertService.run('Taille de barbe', 20, 20, 'Taille et modelage de la barbe', tenantId);

  // Créer Stripe customer si Stripe est configuré
  if (process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.includes('sk_xxx')) {
    try {
      const Stripe = require('stripe');
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const customer = await stripe.customers.create({ email, name: shopName, metadata: { tenantId: String(tenantId), slug } });
      db.prepare('UPDATE tenants SET stripe_customer_id = ? WHERE id = ?').run(customer.id, tenantId);
    } catch(e) { console.error('[Stripe] Customer creation failed:', e.message); }
  }

  const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId);
  const user = db.prepare('SELECT * FROM users WHERE email = ? AND tenant_id = ?').get(email, tenantId);
  const accessToken = jwt.sign({ userId: user.id, tenantId, role: 'owner', plan, slug }, process.env.JWT_SECRET || 'jwt_fallback_secret', { expiresIn: '15m' });
  const refreshRaw = crypto.randomBytes(40).toString('hex');
  const refreshHash = crypto.createHash('sha256').update(refreshRaw).digest('hex');
  db.prepare('INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)').run(user.id, refreshHash, new Date(Date.now()+30*24*60*60*1000).toISOString());

  res.json({ success: true, accessToken, refreshToken: refreshRaw, tenantSlug: slug, trialEnds: trialEnd });
});

module.exports = router;
