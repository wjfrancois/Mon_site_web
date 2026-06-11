const jwt = require('jsonwebtoken');
const db = require('../database');

// Vérifie le JWT et injecte req.user, req.tenantId, req.tenant
async function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    // Aussi vérifier session legacy pour compatibilité
    if (req.session?.authenticated && req.session?.tenantId) {
      req.tenantId = req.session.tenantId;
      req.user = req.session.user;
      req.tenant = await db.prepare('SELECT * FROM tenants WHERE id = ?').get(req.tenantId);
      return next();
    }
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Token manquant' });
    return res.redirect('/login');
  }
  try {
    const token = header.split(' ')[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'jwt_fallback_secret');
    req.user = payload;
    req.tenantId = payload.tenantId;
    req.tenant = await db.prepare('SELECT * FROM tenants WHERE id = ?').get(payload.tenantId);
    if (!req.tenant || req.tenant.plan_status === 'cancelled') {
      return res.status(403).json({ error: 'Abonnement inactif' });
    }
    next();
  } catch(e) {
    if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Token invalide ou expiré' });
    return res.redirect('/login');
  }
}

// Exige un rôle owner
function requireOwner(req, res, next) {
  if (req.user?.role !== 'owner') return res.status(403).json({ error: 'Réservé au propriétaire' });
  next();
}

module.exports = { requireAuth, requireOwner };
