const express = require('express');
const router = express.Router();
const db = require('../database');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'jwt_fallback_secret';
const PLAN_PRICE = { starter: 29, pro: 59, business: 99 };

// Hash le mot de passe au démarrage — jamais stocké en clair en mémoire
const _SA_EMAIL = process.env.SUPERADMIN_EMAIL || null;
const _SA_HASH  = process.env.SUPERADMIN_PASSWORD
  ? bcrypt.hashSync(process.env.SUPERADMIN_PASSWORD, 12)
  : null;

// Rate limiter en mémoire : max 5 tentatives / 15 min par IP
const _attempts = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const entry = _attempts.get(ip) || { n: 0, until: now + 15 * 60 * 1000 };
  if (now > entry.until) { entry.n = 0; entry.until = now + 15 * 60 * 1000; }
  entry.n++;
  _attempts.set(ip, entry);
  return entry.n > 5;
}

function requireSuperAdmin(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Non autorisé' });
  try {
    const payload = jwt.verify(header.split(' ')[1], JWT_SECRET);
    if (payload.role !== 'superadmin') return res.status(403).json({ error: 'Accès refusé' });
    next();
  } catch(e) {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

// POST /api/superadmin/login
router.post('/login', async (req, res) => {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';

  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans 15 minutes.' });
  }

  // Délai constant anti-timing même si non configuré
  await new Promise(r => setTimeout(r, 600));

  if (!_SA_EMAIL || !_SA_HASH) {
    return res.status(503).json({ error: 'Superadmin non configuré — ajoutez SUPERADMIN_EMAIL et SUPERADMIN_PASSWORD dans vos variables d\'environnement.' });
  }

  const { email, password } = req.body;
  const emailOk = email === _SA_EMAIL;
  // bcrypt.compare est résistant aux timing attacks par conception
  const pwdOk   = emailOk && await bcrypt.compare(password || '', _SA_HASH);

  if (!emailOk || !pwdOk) {
    return res.status(401).json({ error: 'Identifiants incorrects' });
  }

  // Succès : réinitialiser le compteur d'essais
  _attempts.delete(ip);

  const token = jwt.sign({ role: 'superadmin', email }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ accessToken: token });
});

// GET /api/superadmin/stats
router.get('/stats', requireSuperAdmin, async (req, res) => {
  const counts = await db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN plan_status='active'   THEN 1 ELSE 0 END) as active,
      SUM(CASE WHEN plan_status='trialing' THEN 1 ELSE 0 END) as trialing,
      SUM(CASE WHEN plan_status='cancelled' THEN 1 ELSE 0 END) as cancelled,
      SUM(CASE WHEN plan_status='past_due' THEN 1 ELSE 0 END) as past_due
    FROM tenants
  `).get();

  const planRows = await db.prepare(`SELECT plan, plan_status, COUNT(*) as cnt FROM tenants GROUP BY plan, plan_status`).all();
  let mrr = 0;
  const byPlan = {};
  planRows.forEach(p => {
    if (!byPlan[p.plan]) byPlan[p.plan] = { active: 0, trialing: 0, revenue: 0 };
    byPlan[p.plan][p.plan_status === 'active' ? 'active' : 'trialing'] += p.cnt;
    if (p.plan_status === 'active') { mrr += (PLAN_PRICE[p.plan] || 0) * p.cnt; byPlan[p.plan].revenue += (PLAN_PRICE[p.plan] || 0) * p.cnt; }
  });

  const signups30 = (await db.prepare(`SELECT COUNT(*) as c FROM tenants WHERE created_at >= (NOW() - INTERVAL '30 days')`).get()).c;
  const appts30   = (await db.prepare(`SELECT COUNT(*) as c FROM appointments WHERE created_at >= (NOW() - INTERVAL '30 days')`).get()).c;

  res.json({ ...counts, mrr, signups_30: signups30, appts_30: appts30, by_plan: byPlan });
});

// GET /api/superadmin/tenants
router.get('/tenants', requireSuperAdmin, async (req, res) => {
  const rows = await db.prepare(`
    SELECT t.*,
      (SELECT u.name  FROM users u WHERE u.tenant_id=t.id AND u.role='owner' LIMIT 1) as owner_name,
      (SELECT u.email FROM users u WHERE u.tenant_id=t.id AND u.role='owner' LIMIT 1) as owner_email,
      (SELECT COUNT(*) FROM barbers   b WHERE b.tenant_id=t.id AND b.active=1)     as barbers_count,
      (SELECT COUNT(*) FROM clients   c WHERE c.tenant_id=t.id)                    as clients_count,
      (SELECT COUNT(*) FROM appointments a WHERE a.tenant_id=t.id)                 as appts_count
    FROM tenants t ORDER BY t.created_at DESC
  `).all();
  res.json(rows);
});

// POST /api/superadmin/impersonate/:tenantId  – génère un token court (1h) pour accéder à l'admin du salon
router.post('/impersonate/:tenantId', requireSuperAdmin, async (req, res) => {
  const tenant = await db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.params.tenantId);
  if (!tenant) return res.status(404).json({ error: 'Salon introuvable' });
  const owner = await db.prepare("SELECT * FROM users WHERE tenant_id=? AND role='owner' LIMIT 1").get(tenant.id);
  if (!owner) return res.status(404).json({ error: 'Propriétaire introuvable' });

  const token = jwt.sign(
    { userId: owner.id, tenantId: tenant.id, role: owner.role, plan: tenant.plan, slug: tenant.slug, impersonated: true },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
  res.json({ accessToken: token, tenant: { name: tenant.name, slug: tenant.slug } });
});

module.exports = router;
