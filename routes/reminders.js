const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/', (req, res) => {
  const { status } = req.query;
  let query = `
    SELECT r.*, c.name as client_name, c.phone as client_phone,
           a.date as appt_date, a.time as appt_time
    FROM reminders r
    JOIN clients c ON r.client_id = c.id
    LEFT JOIN appointments a ON r.appointment_id = a.id
    WHERE r.tenant_id = ?
  `;
  const params = [req.tenantId];
  if (status) { query += ' AND r.status = ?'; params.push(status); }
  query += ' ORDER BY r.scheduled_at ASC';
  res.json(db.prepare(query).all(...params));
});

router.post('/', (req, res) => {
  const { client_id, appointment_id, message, channel, scheduled_at } = req.body;
  if (!client_id || !message || !scheduled_at) return res.status(400).json({ error: 'Champs obligatoires manquants' });

  const result = db.prepare('INSERT INTO reminders (client_id, appointment_id, message, channel, scheduled_at, tenant_id) VALUES (?, ?, ?, ?, ?, ?)').run(client_id, appointment_id || null, message, channel || 'sms', scheduled_at, req.tenantId);
  res.json({ id: result.lastInsertRowid });
});

// Simulate sending reminder
router.post('/:id/send', (req, res) => {
  const reminder = db.prepare('SELECT r.*, c.phone, c.name FROM reminders r JOIN clients c ON r.client_id = c.id WHERE r.id = ? AND r.tenant_id = ?').get(req.params.id, req.tenantId);
  if (!reminder) return res.status(404).json({ error: 'Rappel introuvable' });

  const sentAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
  db.prepare('UPDATE reminders SET status = ?, sent_at = ? WHERE id = ? AND tenant_id = ?').run('sent', sentAt, req.params.id, req.tenantId);

  if (reminder.appointment_id) {
    db.prepare('UPDATE appointments SET reminder_sent = 1 WHERE id = ? AND tenant_id = ?').run(reminder.appointment_id, req.tenantId);
  }

  res.json({ message: `Rappel envoyé à ${reminder.name} (${reminder.phone})`, simulated: true });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM reminders WHERE id = ? AND tenant_id = ?').run(req.params.id, req.tenantId);
  res.json({ message: 'Rappel supprimé' });
});

// Get pending reminders due now (called by cron)
router.get('/due', (req, res) => {
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const due = db.prepare(`SELECT r.*, c.phone, c.name FROM reminders r JOIN clients c ON r.client_id = c.id WHERE r.status = 'pending' AND r.scheduled_at <= ? AND r.tenant_id = ?`).all(now, req.tenantId);
  res.json(due);
});

module.exports = router;
