require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const cron = require('node-cron');
const db = require('./database');
const { sendSMS, sendEmail, reminderEmailHTML } = require('./utils/notifications');
const { requireAuth } = require('./middleware/tenantAuth');
const { guardSmsQuota, incrementSmsUsage } = require('./middleware/planGuard');

const app = express();
const PORT = process.env.PORT || 3000;
const VIEWS = path.join(__dirname, 'views');

app.use(cors());
app.use(session({
  secret: process.env.SESSION_SECRET || 'fenix_barbier_fallback_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 8 * 60 * 60 * 1000 }
}));

// Stripe webhook doit recevoir le body brut AVANT express.json
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

// Bloquer accès direct aux fichiers HTML admin
app.use((req, res, next) => {
  const blocked = ['/admin.html', '/admin.htm', '/login.html'];
  if (blocked.includes(req.path.toLowerCase())) return res.redirect(301, '/admin');
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// === ROUTES PUBLIQUES ===
app.use('/', require('./routes/auth'));
app.use('/api/book', require('./routes/booking'));
app.use('/api/onboarding', require('./routes/onboarding'));
app.use('/api/stripe', require('./routes/stripe'));
app.use('/api/superadmin', require('./routes/superadmin'));

app.use('/api/appointments', requireAuth, require('./routes/appointments'));

// === ROUTES API ADMIN (JWT requis) ===
app.use('/api/clients', requireAuth, require('./routes/clients'));
app.use('/api/barbers', requireAuth, require('./routes/barbers'));
app.use('/api/services', requireAuth, require('./routes/services'));
app.use('/api/accounting', requireAuth, require('./routes/accounting'));
app.use('/api/stats', requireAuth, require('./routes/stats'));
app.use('/api/reminders', requireAuth, require('./routes/reminders'));
app.use('/api/admin/customization', requireAuth, require('./routes/customization'));
app.use('/api/admin/team', requireAuth, require('./routes/team'));
app.use('/api/admin/billing', requireAuth, require('./routes/stripe'));
app.use('/api/admin/gallery', requireAuth, require('./routes/gallery'));
app.use('/api/admin/products', requireAuth, require('./routes/products'));

// GET /api/admin/me — infos utilisateur + tenant + plan
app.get('/api/admin/me', requireAuth, (req, res) => {
  const { getPlan } = require('./utils/plans');
  const plan = getPlan(req.tenant.plan);
  const daysLeft = req.tenant.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(req.tenant.trial_ends_at) - new Date()) / (1000 * 60 * 60 * 24)))
    : 0;
  const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(req.user.userId);
  res.json({
    user: user || { id: req.user.userId, name: '', email: '', role: req.user.role },
    tenant: { ...req.tenant, days_left_trial: daysLeft },
    plan_limits: plan,
    booking_url: `${process.env.APP_URL || 'http://localhost:3000'}/book/${req.tenant.slug}`
  });
});

// === PAGES HTML ===
app.get('/admin', (req, res) => res.sendFile(path.join(VIEWS, 'admin.html')));
app.get('/login', (req, res) => res.sendFile(path.join(VIEWS, 'login.html')));
app.get('/signup', (req, res) => res.sendFile(path.join(VIEWS, 'onboarding.html')));
app.get('/pricing', (req, res) => res.sendFile(path.join(VIEWS, 'pricing.html')));
app.get('/superadmin', (req, res) => res.sendFile(path.join(VIEWS, 'superadmin.html')));
app.get('/book/:slug', (req, res) => res.sendFile(path.join(VIEWS, 'booking.html')));

// === CRON : Rappels SMS/Email toutes les 5 minutes ===
cron.schedule('*/5 * * * *', async () => {
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const due = db.prepare(`
    SELECT r.*, c.phone, c.email, c.name as client_name,
           a.date as appt_date, a.time as appt_time,
           s.name as service_name, b.name as barber_name,
           t.name as tenant_name, t.phone as tenant_phone, t.id as tid, t.plan
    FROM reminders r
    JOIN clients c ON r.client_id = c.id
    JOIN tenants t ON r.tenant_id = t.id
    LEFT JOIN appointments a ON r.appointment_id = a.id
    LEFT JOIN services s ON a.service_id = s.id
    LEFT JOIN barbers b ON a.barber_id = b.id
    WHERE r.status = 'pending' AND r.scheduled_at <= ?
      AND t.plan_status IN ('active', 'trialing')
  `).all(now);

  for (const r of due) {
    try {
      if ((r.channel === 'sms' || !r.channel) && guardSmsQuota(r.tid)) {
        await sendSMS(r.phone, r.message);
        incrementSmsUsage(r.tid);
      } else if (r.channel === 'email' && r.email) {
        const html = reminderEmailHTML({
          clientName: r.client_name,
          service: r.service_name || 'Rendez-vous',
          barber: r.barber_name || '',
          date: r.appt_date || '',
          time: r.appt_time || '',
          price: ''
        });
        await sendEmail(r.email, `Rappel – ${r.tenant_name || 'Barbershop'}`, html);
      }
      db.prepare('UPDATE reminders SET status = ?, sent_at = ? WHERE id = ?').run('sent', now, r.id);
      if (r.appointment_id) db.prepare('UPDATE appointments SET reminder_sent = 1 WHERE id = ?').run(r.appointment_id);
    } catch (err) {
      console.error(`[Rappel #${r.id}] Erreur:`, err.message);
    }
  }
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/{*path}', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`✂  Créno – App démarrée sur http://localhost:${PORT}`);
  console.log(`🔒 Admin: http://localhost:${PORT}/admin`);
});

module.exports = app;
