const express = require('express');
const router = express.Router();
const db = require('../database');

// GET /api/admin/blocked-slots?date=YYYY-MM-DD&barber_id=
router.get('/', async (req, res) => {
  const { date, barber_id } = req.query;
  if (!date) return res.status(400).json({ error: 'date requis' });

  let query = 'SELECT bs.*, b.name as barber_name FROM blocked_slots bs LEFT JOIN barbers b ON bs.barber_id = b.id WHERE bs.tenant_id = ? AND bs.date = ?';
  const params = [req.tenantId, date];
  if (barber_id) {
    query += ' AND (bs.barber_id = ? OR bs.barber_id IS NULL)';
    params.push(barber_id);
  }
  query += ' ORDER BY bs.start_time';

  const rows = await db.prepare(query).all(...params);
  res.json(rows);
});

// POST /api/admin/blocked-slots
router.post('/', async (req, res) => {
  const { barber_id, date, start_time, end_time, reason } = req.body;
  if (!date || !start_time || !end_time) {
    return res.status(400).json({ error: 'date, start_time et end_time sont requis' });
  }
  const [sh, sm] = start_time.split(':').map(Number);
  const [eh, em] = end_time.split(':').map(Number);
  if (sh * 60 + sm >= eh * 60 + em) {
    return res.status(400).json({ error: 'L\'heure de fin doit être après l\'heure de début' });
  }
  const result = await db.prepare(
    'INSERT INTO blocked_slots (tenant_id, barber_id, date, start_time, end_time, reason) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(req.tenantId, barber_id || null, date, start_time, end_time, reason || null);

  res.status(201).json({ id: result.lastInsertRowid, message: 'Plage bloquée' });
});

// DELETE /api/admin/blocked-slots/:id
router.delete('/:id', async (req, res) => {
  await db.prepare('DELETE FROM blocked_slots WHERE id = ? AND tenant_id = ?').run(req.params.id, req.tenantId);
  res.json({ message: 'Plage supprimée' });
});

module.exports = router;
