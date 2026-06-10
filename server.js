const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes API
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/services', require('./routes/services'));
app.use('/api/barbers', require('./routes/barbers'));
app.use('/api/accounting', require('./routes/accounting'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/reminders', require('./routes/reminders'));

// Cron: process due reminders every 5 minutes
cron.schedule('*/5 * * * *', () => {
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const due = db.prepare(`
    SELECT r.*, c.phone, c.name FROM reminders r
    JOIN clients c ON r.client_id = c.id
    WHERE r.status = 'pending' AND r.scheduled_at <= ?
  `).all(now);

  due.forEach(r => {
    // Simulate sending (in production: call Twilio/SendGrid)
    console.log(`[REMINDER] -> ${r.name} (${r.phone}): ${r.message}`);
    const sentAt = now;
    db.prepare('UPDATE reminders SET status = ?, sent_at = ? WHERE id = ?').run('sent', sentAt, r.id);
    if (r.appointment_id) {
      db.prepare('UPDATE appointments SET reminder_sent = 1 WHERE id = ?').run(r.appointment_id);
    }
  });
});

// SPA fallback
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/{*path}', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`BarberShop App running on http://localhost:${PORT}`);
});

module.exports = app;
