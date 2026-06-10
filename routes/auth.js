require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();

// Hash du mot de passe admin (calculé au démarrage)
let adminHash = null;
async function getAdminHash() {
  if (!adminHash) {
    const pwd = process.env.ADMIN_PASSWORD || 'Fenix2024!';
    adminHash = await bcrypt.hash(pwd, 10);
  }
  return adminHash;
}
getAdminHash();

// GET /login — maintenant géré dans server.js (serve depuis views/)
// router.get('/login', ...) retiré pour éviter le doublon

// POST /login
router.post('/login', async (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: 'Mot de passe requis' });

  const pwd = process.env.ADMIN_PASSWORD || 'Fenix2024!';
  const valid = password === pwd || await bcrypt.compare(password, await getAdminHash());

  if (!valid) {
    // Délai anti-brute-force
    await new Promise(r => setTimeout(r, 800));
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }

  req.session.authenticated = true;
  req.session.loginAt = new Date().toISOString();
  res.json({ success: true });
});

// POST /logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// GET /logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// Middleware de protection admin
function requireAuth(req, res, next) {
  if (req.session?.authenticated) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Non autorisé' });
  res.redirect('/login');
}

module.exports = { router, requireAuth };
