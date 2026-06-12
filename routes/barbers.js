const express = require('express');
const router = express.Router();
const db = require('../database');
const { guardBarberLimit } = require('../middleware/planGuard');

router.get('/', async (req, res) => {
  // If tenant context available (admin), filter by tenant. Otherwise return all active (legacy public).
  if (req.tenantId) {
    const barbers = await db.prepare('SELECT * FROM barbers WHERE active = 1 AND tenant_id = ? ORDER BY name ASC').all(req.tenantId);
    return res.json(barbers);
  }
  const barbers = await db.prepare('SELECT * FROM barbers WHERE active = 1 ORDER BY name ASC').all();
  res.json(barbers);
});

router.post('/', guardBarberLimit, async (req, res) => {
  const { name, email, phone, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Nom obligatoire' });
  const tenantId = req.tenantId || 1;
  const result = await db.prepare('INSERT INTO barbers (name, email, phone, color, tenant_id) VALUES (?, ?, ?, ?, ?)').run(name, email || null, phone || null, color || '#3B82F6', tenantId);
  const bid = result.lastInsertRowid;
  await db.transaction(async (txDb) => {
    const insH = txDb.prepare('INSERT INTO working_hours (barber_id, day_of_week, start_time, end_time, is_closed, tenant_id) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING');
    for (const [d, s, e, c] of [[0,'10:00','17:00',0],[1,'09:00','18:00',0],[2,'09:00','18:00',0],[3,'09:00','18:00',0],[4,'09:00','18:00',0],[5,'09:00','18:00',0],[6,'10:00','17:00',0]]) {
      await insH.run(bid, d, s, e, c, tenantId);
    }
  });
  res.json({ id: bid });
});

router.put('/:id', async (req, res) => {
  const { name, email, phone, color, active } = req.body;
  const tenantId = req.tenantId || 1;
  await db.prepare('UPDATE barbers SET name=?, email=?, phone=?, color=?, active=? WHERE id=? AND tenant_id=?').run(name, email || null, phone || null, color || '#3B82F6', active ?? 1, req.params.id, tenantId);
  res.json({ message: 'Barbier mis à jour' });
});

router.delete('/:id', async (req, res) => {
  const tenantId = req.tenantId || 1;
  const future = await db.prepare(`
    SELECT COUNT(*) as c FROM appointments
    WHERE barber_id = ? AND tenant_id = ? AND date >= to_char(NOW(), 'YYYY-MM-DD') AND status NOT IN ('cancelled','completed')
  `).get(req.params.id, tenantId);

  if (future.c > 0) {
    return res.status(409).json({
      error: `Ce barbier a ${future.c} rendez-vous à venir. Annulez-les d'abord avant de le supprimer.`
    });
  }

  await db.prepare('UPDATE barbers SET active = 0 WHERE id = ? AND tenant_id = ?').run(req.params.id, tenantId);
  res.json({ message: 'Barbier désactivé' });
});

router.get('/:id/hours', async (req, res) => {
  const tenantId = req.tenantId || 1;
  const hours = await db.prepare('SELECT * FROM working_hours WHERE barber_id = ? AND tenant_id = ? ORDER BY day_of_week ASC').all(req.params.id, tenantId);
  res.json(hours);
});

router.put('/:id/hours', async (req, res) => {
  const { hours } = req.body;
  const tenantId = req.tenantId || 1;
  await db.transaction(async (txDb) => {
    const upsert = txDb.prepare('INSERT INTO working_hours (barber_id, day_of_week, start_time, end_time, is_closed, tenant_id) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (barber_id, day_of_week) DO UPDATE SET start_time=EXCLUDED.start_time, end_time=EXCLUDED.end_time, is_closed=EXCLUDED.is_closed, tenant_id=EXCLUDED.tenant_id');
    for (const h of hours) {
      await upsert.run(req.params.id, h.day_of_week, h.start_time, h.end_time, h.is_closed ? 1 : 0, tenantId);
    }
  });
  res.json({ message: 'Horaires mis à jour' });
});

module.exports = router;
