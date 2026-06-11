const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../database');
const { requireOwner } = require('../middleware/tenantAuth');
const { getPlan } = require('../utils/plans');

// GET /api/admin/team
router.get('/', (req, res) => {
  const members = db.prepare('SELECT id, name, email, role, active, created_at FROM users WHERE tenant_id = ? ORDER BY role ASC, name ASC').all(req.tenantId);
  res.json(members);
});

// POST /api/admin/team (owner seulement)
router.post('/', requireOwner, async (req, res) => {
  const { name, email, password, role = 'admin' } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Nom, email et mot de passe requis' });
  if (!['admin','barber'].includes(role)) return res.status(400).json({ error: 'Rôle invalide' });

  const plan = getPlan(req.tenant?.plan);
  if (plan.maxTeam !== -1) {
    const count = db.prepare('SELECT COUNT(*) as c FROM users WHERE tenant_id = ? AND active = 1').get(req.tenantId);
    if (count.c >= plan.maxTeam) return res.status(403).json({ error: `Limite d'équipe atteinte pour votre plan`, upgrade: true });
  }

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) return res.status(409).json({ error: 'Cet email est déjà utilisé' });

  const hash = await bcrypt.hash(password, 10);
  const r = db.prepare('INSERT INTO users (tenant_id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)').run(req.tenantId, email, hash, name, role);
  res.json({ id: r.lastInsertRowid, message: 'Membre ajouté' });
});

// PUT /api/admin/team/:id (owner seulement)
router.put('/:id', requireOwner, (req, res) => {
  const { role, active } = req.body;
  if (role && !['owner','admin','barber'].includes(role)) return res.status(400).json({ error: 'Rôle invalide' });
  const user = db.prepare('SELECT * FROM users WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenantId);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  db.prepare('UPDATE users SET role = COALESCE(?, role), active = COALESCE(?, active) WHERE id = ? AND tenant_id = ?').run(role || null, active ?? null, req.params.id, req.tenantId);
  res.json({ message: 'Membre mis à jour' });
});

// DELETE /api/admin/team/:id (owner seulement, ne peut pas supprimer soi-même)
router.delete('/:id', requireOwner, (req, res) => {
  if (parseInt(req.params.id) === req.user.userId) return res.status(400).json({ error: 'Impossible de se supprimer soi-même' });
  db.prepare('UPDATE users SET active = 0 WHERE id = ? AND tenant_id = ?').run(req.params.id, req.tenantId);
  res.json({ message: 'Membre désactivé' });
});

module.exports = router;
