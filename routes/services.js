const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
  if (req.tenantId) {
    const services = db.prepare('SELECT * FROM services WHERE active = 1 AND tenant_id = ? ORDER BY name ASC').all(req.tenantId);
    return res.json(services);
  }
  const services = db.prepare('SELECT * FROM services WHERE active = 1 ORDER BY name ASC').all();
  res.json(services);
});

router.post('/', (req, res) => {
  const { name, duration, price, description } = req.body;
  if (!name || !duration || price === undefined) return res.status(400).json({ error: 'Champs obligatoires manquants' });
  const tenantId = req.tenantId || 1;
  const result = db.prepare('INSERT INTO services (name, duration, price, description, tenant_id) VALUES (?, ?, ?, ?, ?)').run(name, duration, price, description || null, tenantId);
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { name, duration, price, description, active } = req.body;
  const tenantId = req.tenantId || 1;
  db.prepare('UPDATE services SET name=?, duration=?, price=?, description=?, active=? WHERE id=? AND tenant_id=?').run(name, duration, price, description || null, active ?? 1, req.params.id, tenantId);
  res.json({ message: 'Service mis à jour' });
});

router.delete('/:id', (req, res) => {
  const tenantId = req.tenantId || 1;
  db.prepare('UPDATE services SET active = 0 WHERE id = ? AND tenant_id = ?').run(req.params.id, tenantId);
  res.json({ message: 'Service désactivé' });
});

module.exports = router;
