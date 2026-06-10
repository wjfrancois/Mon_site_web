const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
  const services = db.prepare('SELECT * FROM services WHERE active = 1 ORDER BY name ASC').all();
  res.json(services);
});

router.post('/', (req, res) => {
  const { name, duration, price, description } = req.body;
  if (!name || !duration || price === undefined) return res.status(400).json({ error: 'Champs obligatoires manquants' });
  const result = db.prepare('INSERT INTO services (name, duration, price, description) VALUES (?, ?, ?, ?)').run(name, duration, price, description || null);
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { name, duration, price, description, active } = req.body;
  db.prepare('UPDATE services SET name=?, duration=?, price=?, description=?, active=? WHERE id=?').run(name, duration, price, description || null, active ?? 1, req.params.id);
  res.json({ message: 'Service mis à jour' });
});

router.delete('/:id', (req, res) => {
  db.prepare('UPDATE services SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Service désactivé' });
});

module.exports = router;
