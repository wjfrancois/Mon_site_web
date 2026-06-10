const express = require('express');
const router = express.Router();
const db = require('../database');
const { v4: uuidv4 } = require('uuid');

// Get all appointments with details
router.get('/', (req, res) => {
  const { date, barber_id, status, month } = req.query;
  let query = `
    SELECT a.*,
      c.name as client_name, c.phone as client_phone, c.email as client_email,
      b.name as barber_name, b.color as barber_color,
      s.name as service_name, s.duration, s.price
    FROM appointments a
    JOIN clients c ON a.client_id = c.id
    JOIN barbers b ON a.barber_id = b.id
    JOIN services s ON a.service_id = s.id
    WHERE 1=1
  `;
  const params = [];

  if (date) { query += ' AND a.date = ?'; params.push(date); }
  if (barber_id) { query += ' AND a.barber_id = ?'; params.push(barber_id); }
  if (status) { query += ' AND a.status = ?'; params.push(status); }
  if (month) { query += ' AND strftime("%Y-%m", a.date) = ?'; params.push(month); }

  query += ' ORDER BY a.date ASC, a.time ASC';

  const appointments = db.prepare(query).all(...params);
  res.json(appointments);
});

// Get available time slots
router.get('/available-slots', (req, res) => {
  const { date, barber_id, service_id } = req.query;
  if (!date || !barber_id || !service_id) {
    return res.status(400).json({ error: 'date, barber_id et service_id sont requis' });
  }

  const service = db.prepare('SELECT duration FROM services WHERE id = ?').get(service_id);
  if (!service) return res.status(404).json({ error: 'Service introuvable' });

  const dayOfWeek = new Date(date + 'T12:00:00').getDay();
  const hours = db.prepare('SELECT * FROM working_hours WHERE barber_id = ? AND day_of_week = ?').get(barber_id, dayOfWeek);

  if (!hours || hours.is_closed) {
    return res.json({ slots: [], closed: true });
  }

  const existing = db.prepare(`
    SELECT time, s.duration FROM appointments a
    JOIN services s ON a.service_id = s.id
    WHERE a.date = ? AND a.barber_id = ? AND a.status != 'cancelled'
  `).all(date, barber_id);

  const slots = [];
  const [startH, startM] = hours.start_time.split(':').map(Number);
  const [endH, endM] = hours.end_time.split(':').map(Number);
  const startMin = startH * 60 + startM;
  const endMin = endH * 60 + endM;
  const slotInterval = 15;

  for (let min = startMin; min + service.duration <= endMin; min += slotInterval) {
    const hh = String(Math.floor(min / 60)).padStart(2, '0');
    const mm = String(min % 60).padStart(2, '0');
    const slotTime = `${hh}:${mm}`;

    const slotStart = min;
    const slotEnd = min + service.duration;

    const conflict = existing.some(appt => {
      const [ah, am] = appt.time.split(':').map(Number);
      const apptStart = ah * 60 + am;
      const apptEnd = apptStart + appt.duration;
      return slotStart < apptEnd && slotEnd > apptStart;
    });

    if (!conflict) slots.push(slotTime);
  }

  res.json({ slots, working_hours: hours });
});

// Create appointment
router.post('/', (req, res) => {
  const { client_name, client_phone, client_email, barber_id, service_id, date, time, notes } = req.body;

  if (!client_name || !client_phone || !barber_id || !service_id || !date || !time) {
    return res.status(400).json({ error: 'Champs obligatoires manquants' });
  }

  let client = db.prepare('SELECT * FROM clients WHERE phone = ?').get(client_phone);
  if (!client) {
    const result = db.prepare('INSERT INTO clients (name, phone, email) VALUES (?, ?, ?)').run(client_name, client_phone, client_email || null);
    client = { id: result.lastInsertRowid };
  }

  const service = db.prepare('SELECT * FROM services WHERE id = ?').get(service_id);
  if (!service) return res.status(404).json({ error: 'Service introuvable' });

  const appt = db.prepare(`
    INSERT INTO appointments (client_id, barber_id, service_id, date, time, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(client.id, barber_id, service_id, date, time, notes || null);

  // Auto-create reminder for 24h before
  const apptDateTime = new Date(`${date}T${time}`);
  apptDateTime.setHours(apptDateTime.getHours() - 24);
  const reminderTime = apptDateTime.toISOString().slice(0, 16).replace('T', ' ');

  db.prepare(`
    INSERT INTO reminders (client_id, appointment_id, message, channel, scheduled_at)
    VALUES (?, ?, ?, 'sms', ?)
  `).run(client.id, appt.lastInsertRowid,
    `Rappel: Votre rendez-vous "${service.name}" est demain à ${time}. Pour annuler: 514-555-0100`,
    reminderTime
  );

  res.json({ id: appt.lastInsertRowid, client_id: client.id, message: 'Rendez-vous créé avec succès' });
});

// Update appointment status
router.patch('/:id/status', (req, res) => {
  const { status } = req.body;
  const validStatuses = ['pending', 'confirmed', 'completed', 'cancelled', 'no-show'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Statut invalide' });

  db.prepare('UPDATE appointments SET status = ? WHERE id = ?').run(status, req.params.id);

  if (status === 'completed') {
    const appt = db.prepare(`
      SELECT a.*, s.price, s.name as service_name, c.name as client_name
      FROM appointments a JOIN services s ON a.service_id = s.id
      JOIN clients c ON a.client_id = c.id WHERE a.id = ?
    `).get(req.params.id);

    if (appt) {
      db.prepare(`
        INSERT INTO transactions (type, category, description, amount, date, appointment_id)
        VALUES ('income', 'service', ?, ?, ?, ?)
      `).run(`${appt.service_name} - ${appt.client_name}`, appt.price, appt.date, appt.id);

      db.prepare('UPDATE clients SET loyalty_points = loyalty_points + 10 WHERE id = ?').run(appt.client_id);
    }
  }

  res.json({ message: 'Statut mis à jour' });
});

// Delete appointment
router.delete('/:id', (req, res) => {
  db.prepare('UPDATE appointments SET status = ? WHERE id = ?').run('cancelled', req.params.id);
  res.json({ message: 'Rendez-vous annulé' });
});

module.exports = router;
