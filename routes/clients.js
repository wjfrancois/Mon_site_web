const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
  const { search } = req.query;
  let query = 'SELECT * FROM clients WHERE tenant_id = ?';
  const params = [req.tenantId];
  if (search) {
    query += ' AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s);
  }
  query += ' ORDER BY name ASC';
  res.json(db.prepare(query).all(...params));
});

router.get('/:id', (req, res) => {
  const client = db.prepare('SELECT * FROM clients WHERE id = ? AND tenant_id = ?').get(req.params.id, req.tenantId);
  if (!client) return res.status(404).json({ error: 'Client introuvable' });

  const appointments = db.prepare(`
    SELECT a.*, s.name as service_name, s.price, b.name as barber_name
    FROM appointments a
    JOIN services s ON a.service_id = s.id
    JOIN barbers b ON a.barber_id = b.id
    WHERE a.client_id = ? AND a.tenant_id = ?
    ORDER BY a.date DESC, a.time DESC
  `).all(req.params.id, req.tenantId);

  const stats = db.prepare(`
    SELECT COUNT(*) as total_visits,
           SUM(CASE WHEN a.status = 'completed' THEN s.price ELSE 0 END) as total_spent,
           MAX(a.date) as last_visit
    FROM appointments a JOIN services s ON a.service_id = s.id
    WHERE a.client_id = ? AND a.tenant_id = ? AND a.status = 'completed'
  `).get(req.params.id, req.tenantId);

  res.json({ ...client, appointments, stats });
});

router.post('/', (req, res) => {
  const { name, phone, email, notes } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'Nom et téléphone obligatoires' });

  const existing = db.prepare('SELECT id FROM clients WHERE phone = ? AND tenant_id = ?').get(phone, req.tenantId);
  if (existing) return res.status(409).json({ error: 'Ce numéro de téléphone est déjà enregistré', client_id: existing.id });

  const result = db.prepare('INSERT INTO clients (name, phone, email, notes, tenant_id) VALUES (?, ?, ?, ?, ?)').run(name, phone, email || null, notes || null, req.tenantId);
  res.json({ id: result.lastInsertRowid, message: 'Client ajouté' });
});

router.put('/:id', (req, res) => {
  const { name, phone, email, notes } = req.body;
  db.prepare('UPDATE clients SET name=?, phone=?, email=?, notes=? WHERE id=? AND tenant_id=?').run(name, phone, email || null, notes || null, req.params.id, req.tenantId);
  res.json({ message: 'Client mis à jour' });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM clients WHERE id = ? AND tenant_id = ?').run(req.params.id, req.tenantId);
  res.json({ message: 'Client supprimé' });
});

module.exports = router;
