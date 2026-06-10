const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
  const barbers = db.prepare('SELECT * FROM barbers WHERE active = 1 ORDER BY name ASC').all();
  res.json(barbers);
});

router.post('/', (req, res) => {
  const { name, email, phone, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Nom obligatoire' });
  const result = db.prepare('INSERT INTO barbers (name, email, phone, color) VALUES (?, ?, ?, ?)').run(name, email || null, phone || null, color || '#3B82F6');
  res.json({ id: result.lastInsertRowid });
});

router.put('/:id', (req, res) => {
  const { name, email, phone, color, active } = req.body;
  db.prepare('UPDATE barbers SET name=?, email=?, phone=?, color=?, active=? WHERE id=?').run(name, email || null, phone || null, color || '#3B82F6', active ?? 1, req.params.id);
  res.json({ message: 'Barbier mis à jour' });
});

router.delete('/:id', (req, res) => {
  const future = db.prepare(`
    SELECT COUNT(*) as c FROM appointments
    WHERE barber_id = ? AND date >= date('now') AND status NOT IN ('cancelled','completed')
  `).get(req.params.id);

  if (future.c > 0) {
    return res.status(409).json({
      error: `Ce barbier a ${future.c} rendez-vous à venir. Annulez-les d'abord avant de le supprimer.`
    });
  }

  db.prepare('UPDATE barbers SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ message: 'Barbier désactivé' });
});

router.get('/:id/hours', (req, res) => {
  const hours = db.prepare('SELECT * FROM working_hours WHERE barber_id = ? ORDER BY day_of_week ASC').all(req.params.id);
  res.json(hours);
});

router.put('/:id/hours', (req, res) => {
  const { hours } = req.body;
  const upsert = db.prepare('INSERT OR REPLACE INTO working_hours (barber_id, day_of_week, start_time, end_time, is_closed) VALUES (?, ?, ?, ?, ?)');
  const tx = db.transaction(() => hours.forEach(h => upsert.run(req.params.id, h.day_of_week, h.start_time, h.end_time, h.is_closed ? 1 : 0)));
  tx();
  res.json({ message: 'Horaires mis à jour' });
});

module.exports = router;
