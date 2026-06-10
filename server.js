require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const cron = require('node-cron');
const db = require('./database');
const { sendSMS, sendEmail, reminderSMSText, reminderEmailHTML } = require('./utils/notifications');
const { router: authRouter, requireAuth } = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;
const VIEWS = path.join(__dirname, 'views');

app.use(cors());
app.use(express.json());

// ⚠️  Session AVANT tout le reste (middleware statique inclus)
app.use(session({
  secret: process.env.SESSION_SECRET || 'fenix_barbier_fallback_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    httpOnly: true,
    maxAge: 8 * 60 * 60 * 1000 // 8 heures
  }
}));

// Bloquer toute tentative d'accès direct aux fichiers admin par URL
app.use((req, res, next) => {
  const blocked = ['/admin.html', '/admin.htm'];
  if (blocked.includes(req.path.toLowerCase())) {
    return res.redirect(301, '/admin');
  }
  next();
});

// Fichiers statiques publics (CSS, JS client, images)
app.use(express.static(path.join(__dirname, 'public')));

// Auth routes (login/logout — publiques)
app.use('/', authRouter);

// Routes API publiques (réservation client)
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/services', require('./routes/services'));
app.use('/api/barbers', require('./routes/barbers'));

// Route settings publique (lecture seule pour le site client)
app.get('/api/public/settings', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM site_settings').all();
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  res.json(settings);
});

// Routes API protégées (admin seulement)
app.use('/api/clients', requireAuth, require('./routes/clients'));
app.use('/api/accounting', requireAuth, require('./routes/accounting'));
app.use('/api/stats', requireAuth, require('./routes/stats'));
app.use('/api/reminders', requireAuth, require('./routes/reminders'));
app.use('/api/settings', requireAuth, require('./routes/settings'));

// Pages protégées — servies depuis views/ (hors dossier public)
app.get('/admin', requireAuth, (req, res) => res.sendFile(path.join(VIEWS, 'admin.html')));
app.get('/login', (req, res) => {
  if (req.session?.authenticated) return res.redirect('/admin');
  res.sendFile(path.join(VIEWS, 'login.html'));
});

// Cron: envoi des rappels dus toutes les 5 minutes
cron.schedule('*/5 * * * *', async () => {
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const due = db.prepare(`
    SELECT r.*, c.phone, c.email, c.name as client_name,
           a.date as appt_date, a.time as appt_time,
           s.name as service_name, b.name as barber_name
    FROM reminders r
    JOIN clients c ON r.client_id = c.id
    LEFT JOIN appointments a ON r.appointment_id = a.id
    LEFT JOIN services s ON a.service_id = s.id
    LEFT JOIN barbers b ON a.barber_id = b.id
    WHERE r.status = 'pending' AND r.scheduled_at <= ?
  `).all(now);

  for (const r of due) {
    try {
      if (r.channel === 'sms' || !r.channel) {
        await sendSMS(r.phone, r.message);
      } else if (r.channel === 'email' && r.email) {
        const html = reminderEmailHTML({
          clientName: r.client_name,
          service: r.service_name || 'Rendez-vous',
          barber: r.barber_name || '',
          date: r.appt_date || '',
          time: r.appt_time || '',
          price: ''
        });
        await sendEmail(r.email, `Rappel – ${process.env.SHOP_NAME || 'Fenix Barbier'}`, html);
      }
      db.prepare('UPDATE reminders SET status = ?, sent_at = ? WHERE id = ?').run('sent', now, r.id);
      if (r.appointment_id) db.prepare('UPDATE appointments SET reminder_sent = 1 WHERE id = ?').run(r.appointment_id);
    } catch (err) {
      console.error(`[Rappel #${r.id}] Erreur:`, err.message);
    }
  }
});

// Page client (accès public)
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/{*path}', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`✂  Fenix Barbier – App démarrée sur http://localhost:${PORT}`);
  console.log(`🔒 Admin: http://localhost:${PORT}/admin  (mdp: ${process.env.ADMIN_PASSWORD || 'Fenix2024!'})`);
});

module.exports = app;
