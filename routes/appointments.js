const express = require('express');
const router = express.Router();
const db = require('../database');
const { sendSMS, sendEmail, confirmationEmailHTML } = require('../utils/notifications');
const { guardSmsQuota, incrementSmsUsage } = require('../middleware/planGuard');

// Get all appointments with details
router.get('/', async (req, res) => {
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
    WHERE a.tenant_id = ?
  `;
  const params = [req.tenantId];

  if (date) { query += ' AND a.date = ?'; params.push(date); }
  if (barber_id) { query += ' AND a.barber_id = ?'; params.push(barber_id); }
  if (status) { query += ' AND a.status = ?'; params.push(status); }
  if (month) { query += ' AND substring(a.date, 1, 7) = ?'; params.push(month); }

  query += ' ORDER BY a.date ASC, a.time ASC';

  const appointments = await db.prepare(query).all(...params);
  res.json(appointments);
});

// Get available time slots
router.get('/available-slots', async (req, res) => {
  const { date, barber_id, service_id } = req.query;
  if (!date || !barber_id || !service_id) {
    return res.status(400).json({ error: 'date, barber_id et service_id sont requis' });
  }

  const service = await db.prepare('SELECT duration FROM services WHERE id = ? AND tenant_id = ?').get(service_id, req.tenantId);
  if (!service) return res.status(404).json({ error: 'Service introuvable' });

  const dayOfWeek = new Date(date + 'T12:00:00').getDay();
  const hours = await db.prepare('SELECT * FROM working_hours WHERE barber_id = ? AND day_of_week = ? AND tenant_id = ?').get(barber_id, dayOfWeek, req.tenantId);

  if (!hours || hours.is_closed) {
    return res.json({ slots: [], closed: true });
  }

  const existing = await db.prepare(`
    SELECT a.time, s.duration FROM appointments a
    JOIN services s ON a.service_id = s.id
    WHERE a.date = ? AND a.barber_id = ? AND a.tenant_id = ? AND a.status != 'cancelled'
  `).all(date, barber_id, req.tenantId);

  const blocked = await db.prepare(
    'SELECT start_time, end_time FROM blocked_slots WHERE tenant_id = ? AND date = ? AND (barber_id = ? OR barber_id IS NULL)'
  ).all(req.tenantId, date, barber_id);

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
    const blockedConflict = blocked.some(b => {
      const [bsh, bsm] = b.start_time.split(':').map(Number);
      const [beh, bem] = b.end_time.split(':').map(Number);
      return slotStart < beh*60+bem && slotEnd > bsh*60+bsm;
    });

    if (!conflict && !blockedConflict) slots.push(slotTime);
  }

  res.json({ slots, working_hours: hours });
});

// Create appointment
router.post('/', async (req, res) => {
  const { client_name, client_phone, client_email, barber_id, service_id, date, time, notes } = req.body;

  if (!client_name || !client_phone || !barber_id || !service_id || !date || !time) {
    return res.status(400).json({ error: 'Champs obligatoires manquants' });
  }

  let client = await db.prepare('SELECT * FROM clients WHERE phone = ? AND tenant_id = ?').get(client_phone, req.tenantId);
  if (!client) {
    const result = await db.prepare('INSERT INTO clients (name, phone, email, tenant_id) VALUES (?, ?, ?, ?)').run(client_name, client_phone, client_email || null, req.tenantId);
    client = { id: result.lastInsertRowid };
  }

  const service = await db.prepare('SELECT * FROM services WHERE id = ? AND tenant_id = ?').get(service_id, req.tenantId);
  if (!service) return res.status(404).json({ error: 'Service introuvable' });

  const barber = await db.prepare('SELECT * FROM barbers WHERE id = ? AND tenant_id = ?').get(barber_id, req.tenantId);

  const appt = await db.prepare(`
    INSERT INTO appointments (client_id, barber_id, service_id, date, time, notes, tenant_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(client.id, barber_id, service_id, date, time, notes || null, req.tenantId);

  // Rappel SMS 24h avant
  const apptDateTime = new Date(`${date}T${time}`);
  apptDateTime.setHours(apptDateTime.getHours() - 24);
  const reminderTime = apptDateTime.toISOString().slice(0, 16).replace('T', ' ');
  const shopName = req.tenant?.name || 'Barbier';
  const smsMsg = `[${shopName}] Rappel: votre RDV "${service.name}" est demain ${date} à ${time} avec ${barber?.name || ''}. Pour annuler: ${req.tenant?.phone || ''}`;

  await db.prepare(`INSERT INTO reminders (client_id, appointment_id, message, channel, scheduled_at, tenant_id) VALUES (?, ?, ?, 'sms', ?, ?)`)
    .run(client.id, appt.lastInsertRowid, smsMsg, reminderTime, req.tenantId);

  // Confirmation immédiate (SMS + email si dispo)
  const notifData = { clientName: client_name, service: service.name, barber: barber?.name || '', date, time, price: service.price.toFixed(2) };

  if (guardSmsQuota(req.tenantId)) {
    sendSMS(client_phone, `[${shopName}] Réservation confirmée! ${service.name} le ${date} à ${time} avec ${barber?.name || 'notre équipe'}. À bientôt!`, req.tenant)
      .then(() => incrementSmsUsage(req.tenantId))
      .catch(err => console.error('[SMS confirmation]', err.message));
  }

  if (client_email) {
    const html = confirmationEmailHTML(notifData, req.tenant?.name, req.tenant?.phone, req.tenant?.address);
    sendEmail(client_email, `Confirmation de rendez-vous – ${shopName}`, html, req.tenant)
      .catch(err => console.error('[Email confirmation]', err.message));
  }

  res.json({ id: appt.lastInsertRowid, client_id: client.id, message: 'Rendez-vous créé avec succès' });
});

// Update appointment status
router.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['pending', 'confirmed', 'completed', 'cancelled', 'no-show'];
  if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Statut invalide' });

  await db.prepare('UPDATE appointments SET status = ? WHERE id = ? AND tenant_id = ?').run(status, req.params.id, req.tenantId);

  if (status === 'completed') {
    const appt = await db.prepare(`
      SELECT a.*, s.price, s.name as service_name, c.name as client_name
      FROM appointments a JOIN services s ON a.service_id = s.id
      JOIN clients c ON a.client_id = c.id WHERE a.id = ? AND a.tenant_id = ?
    `).get(req.params.id, req.tenantId);

    if (appt) {
      await db.prepare(`
        INSERT INTO transactions (type, category, description, amount, date, appointment_id, tenant_id)
        VALUES ('income', 'service', ?, ?, ?, ?, ?)
      `).run(`${appt.service_name} - ${appt.client_name}`, appt.price, appt.date, appt.id, req.tenantId);

      await db.prepare('UPDATE clients SET loyalty_points = loyalty_points + 10 WHERE id = ? AND tenant_id = ?').run(appt.client_id, req.tenantId);
    }
  }

  res.json({ message: 'Statut mis à jour' });
});

// Delete appointment
router.delete('/:id', async (req, res) => {
  await db.prepare('UPDATE appointments SET status = ? WHERE id = ? AND tenant_id = ?').run('cancelled', req.params.id, req.tenantId);
  res.json({ message: 'Rendez-vous annulé' });
});

module.exports = router;
