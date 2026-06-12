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

// Migrations PostgreSQL au démarrage
(async () => {
  try {
    await db.prepare("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS booking_confirmation TEXT DEFAULT 'automatic'").run();
    await db.prepare("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS reminder_delay_hours INTEGER DEFAULT 24").run();
    await db.prepare("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS reminder_delays TEXT DEFAULT '24'").run();
    await db.prepare("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS hero_overlay_opacity INTEGER DEFAULT 70").run();
    await db.prepare("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS hero_bg_color TEXT DEFAULT '#1a1a2e'").run();
    await db.prepare("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS hero_mode TEXT DEFAULT 'manual'").run();
    await db.prepare("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS twilio_sid TEXT").run();
    await db.prepare("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS twilio_token TEXT").run();
    await db.prepare("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS twilio_phone TEXT").run();
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS hero_slides (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        url TEXT NOT NULL,
        position INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `).run();
  } catch(e) {
    console.warn('[Migration] Schema:', e.message);
  }

  // Charger les credentials Twilio de la plateforme depuis la DB
  try {
    const [sid, token, phone] = await Promise.all([
      db.prepare("SELECT value FROM site_settings WHERE key = 'twilio_sid'").get(),
      db.prepare("SELECT value FROM site_settings WHERE key = 'twilio_token'").get(),
      db.prepare("SELECT value FROM site_settings WHERE key = 'twilio_phone'").get(),
    ]);
    if (sid?.value)   process.env.TWILIO_ACCOUNT_SID   = sid.value;
    if (token?.value) process.env.TWILIO_AUTH_TOKEN     = token.value;
    if (phone?.value) process.env.TWILIO_PHONE_NUMBER   = phone.value;
    if (sid?.value) console.log('[Twilio] Credentials chargés depuis la DB');
  } catch(e) {
    console.warn('[Twilio] Impossible de charger depuis la DB:', e.message);
  }
})();

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
app.use('/api/admin/hero-slides', requireAuth, require('./routes/heroSlides'));

// PUT /api/admin/hero-overlay
app.put('/api/admin/hero-overlay', requireAuth, async (req, res) => {
  const { hero_overlay_opacity, hero_bg_color, hero_mode } = req.body;
  const opacity = Math.min(90, Math.max(0, parseInt(hero_overlay_opacity) ?? 70));
  const color = /^#[0-9a-fA-F]{6}$/.test(hero_bg_color) ? hero_bg_color : '#1a1a2e';
  const mode = ['manual', 'slideshow'].includes(hero_mode) ? hero_mode : 'manual';
  await db.prepare('UPDATE tenants SET hero_overlay_opacity = ?, hero_bg_color = ?, hero_mode = ? WHERE id = ?')
    .run(opacity, color, mode, req.tenantId);
  res.json({ message: 'Apparence mise à jour' });
});

// PUT /api/admin/booking-settings
app.put('/api/admin/booking-settings', requireAuth, async (req, res) => {
  const { booking_confirmation, reminder_delays } = req.body;
  const validModes = ['automatic', 'manual', 'hybrid'];
  const validDelays = [3, 24, 36, 48, 72];
  if (booking_confirmation && !validModes.includes(booking_confirmation)) {
    return res.status(400).json({ error: 'Mode de confirmation invalide' });
  }
  const delays = Array.isArray(reminder_delays) ? reminder_delays.map(Number).filter(d => validDelays.includes(d)) : [24];
  if (!delays.length) return res.status(400).json({ error: 'Sélectionnez au moins un délai valide' });
  await db.prepare('UPDATE tenants SET booking_confirmation = ?, reminder_delays = ? WHERE id = ?')
    .run(booking_confirmation || 'automatic', delays.join(','), req.tenantId);
  res.json({ message: 'Paramètres sauvegardés' });
});

// GET /api/admin/me — infos utilisateur + tenant + plan
app.get('/api/admin/me', requireAuth, async (req, res) => {
  const { getPlan } = require('./utils/plans');
  const plan = getPlan(req.tenant.plan);
  const daysLeft = req.tenant.trial_ends_at
    ? Math.max(0, Math.ceil((new Date(req.tenant.trial_ends_at) - new Date()) / (1000 * 60 * 60 * 24)))
    : 0;
  const user = await db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(req.user.userId);
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
  const due = await db.prepare(`
    SELECT r.*, c.phone, c.email, c.name as client_name,
           a.date as appt_date, a.time as appt_time,
           s.name as service_name, b.name as barber_name,
           t.name as tenant_name, t.phone as tenant_phone, t.id as tid, t.plan,
           t.twilio_sid, t.twilio_token, t.twilio_phone as twilio_from
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
      const tenantCfg = { name: r.tenant_name, phone: r.tenant_phone, twilio_sid: r.twilio_sid, twilio_token: r.twilio_token, twilio_phone: r.twilio_from };
      if ((r.channel === 'sms' || !r.channel) && await guardSmsQuota(r.tid)) {
        await sendSMS(r.phone, r.message, tenantCfg);
        await incrementSmsUsage(r.tid);
      } else if (r.channel === 'email' && r.email) {
        const html = reminderEmailHTML({
          clientName: r.client_name,
          service: r.service_name || 'Rendez-vous',
          barber: r.barber_name || '',
          date: r.appt_date || '',
          time: r.appt_time || '',
          price: ''
        });
        await sendEmail(r.email, `Rappel – ${r.tenant_name || 'Barbershop'}`, html, tenantCfg);
      }
      await db.prepare('UPDATE reminders SET status = ?, sent_at = ? WHERE id = ?').run('sent', now, r.id);
      if (r.appointment_id) await db.prepare('UPDATE appointments SET reminder_sent = 1 WHERE id = ?').run(r.appointment_id);
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
