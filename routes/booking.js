const express = require('express');
const router = express.Router();
const db = require('../database');
const { sendSMS, sendEmail, confirmationEmailHTML } = require('../utils/notifications');
const { guardSmsQuota, incrementSmsUsage } = require('../middleware/planGuard');

// Résoudre le tenant par slug
function getTenant(slug) {
  return db.prepare("SELECT * FROM tenants WHERE slug = ? AND plan_status != 'cancelled'").get(slug);
}

// GET /api/book/:slug/info
router.get('/:slug/info', (req, res) => {
  const t = getTenant(req.params.slug);
  if (!t) return res.status(404).json({ error: 'Salon introuvable' });
  res.json({
    name: t.name, slug: t.slug, phone: t.phone, address: t.address,
    logo_url: t.logo_url, banner_url: t.banner_url, hero_photo_url: t.hero_photo_url,
    primary_color: t.primary_color || '#e2b04a',
    hero_title: t.hero_title, hero_subtitle: t.hero_subtitle, hero_tag: t.hero_tag,
    instagram_url: t.instagram_url, facebook_url: t.facebook_url, tiktok_url: t.tiktok_url,
    about_text: t.about_text, products_text: t.products_text
  });
});

// GET /api/book/:slug/services
router.get('/:slug/services', (req, res) => {
  const t = getTenant(req.params.slug);
  if (!t) return res.status(404).json({ error: 'Salon introuvable' });
  res.json(db.prepare('SELECT * FROM services WHERE tenant_id = ? AND active = 1 ORDER BY name ASC').all(t.id));
});

// GET /api/book/:slug/barbers
router.get('/:slug/barbers', (req, res) => {
  const t = getTenant(req.params.slug);
  if (!t) return res.status(404).json({ error: 'Salon introuvable' });
  res.json(db.prepare('SELECT id, name, color FROM barbers WHERE tenant_id = ? AND active = 1 ORDER BY name ASC').all(t.id));
});

// GET /api/book/:slug/gallery
router.get('/:slug/gallery', (req, res) => {
  const t = getTenant(req.params.slug);
  if (!t) return res.status(404).json({ error: 'Salon introuvable' });
  res.json(db.prepare('SELECT id, url, caption FROM gallery WHERE tenant_id = ? ORDER BY position ASC, created_at ASC').all(t.id));
});

// GET /api/book/:slug/slots?date=&barber_id=&service_id=
// barber_id=0 ou absent = n'importe lequel
router.get('/:slug/slots', (req, res) => {
  const t = getTenant(req.params.slug);
  if (!t) return res.status(404).json({ error: 'Salon introuvable' });
  const { date, barber_id, service_id } = req.query;
  if (!date || !service_id) return res.status(400).json({ error: 'Paramètres manquants' });

  const service = db.prepare('SELECT duration FROM services WHERE id = ? AND tenant_id = ?').get(service_id, t.id);
  if (!service) return res.status(404).json({ error: 'Service introuvable' });

  const dayOfWeek = new Date(date + 'T12:00:00').getDay();
  const anyBarber = !barber_id || barber_id === '0';
  const barbers = anyBarber
    ? db.prepare('SELECT id FROM barbers WHERE tenant_id = ? AND active = 1').all(t.id)
    : [{ id: Number(barber_id) }];

  if (!barbers.length) return res.json({ slots: [], closed: true });

  // slot -> [barber_id, ...] (which barbers are free at each slot)
  const slotMap = {};

  for (const barber of barbers) {
    const hours = db.prepare('SELECT * FROM working_hours WHERE barber_id = ? AND day_of_week = ? AND tenant_id = ?').get(barber.id, dayOfWeek, t.id);
    if (!hours || hours.is_closed) continue;

    const existing = db.prepare(`
      SELECT a.time, s.duration FROM appointments a
      JOIN services s ON a.service_id = s.id
      WHERE a.date = ? AND a.barber_id = ? AND a.tenant_id = ? AND a.status != 'cancelled'
    `).all(date, barber.id, t.id);

    const [sh, sm] = hours.start_time.split(':').map(Number);
    const [eh, em] = hours.end_time.split(':').map(Number);
    const startMin = sh*60+sm, endMin = eh*60+em;

    for (let min = startMin; min + service.duration <= endMin; min += 15) {
      const slotEnd = min + service.duration;
      const conflict = existing.some(a => {
        const [ah, am] = a.time.split(':').map(Number);
        const as_ = ah*60+am, ae = as_ + a.duration;
        return min < ae && slotEnd > as_;
      });
      if (!conflict) {
        const key = `${String(Math.floor(min/60)).padStart(2,'0')}:${String(min%60).padStart(2,'0')}`;
        if (!slotMap[key]) slotMap[key] = [];
        slotMap[key].push(barber.id);
      }
    }
  }

  const slots = Object.keys(slotMap).sort();
  if (!slots.length && barbers.every(b => {
    const h = db.prepare('SELECT * FROM working_hours WHERE barber_id = ? AND day_of_week = ? AND tenant_id = ?').get(b.id, dayOfWeek, t.id);
    return !h || h.is_closed;
  })) return res.json({ slots: [], closed: true });

  res.json({ slots, slot_barbers: anyBarber ? slotMap : undefined });
});

// POST /api/book/:slug/appointments
router.post('/:slug/appointments', async (req, res) => {
  const t = getTenant(req.params.slug);
  if (!t) return res.status(404).json({ error: 'Salon introuvable' });

  let { client_name, client_phone, client_email, barber_id, service_id, date, time, notes } = req.body;
  if (!client_name || !client_phone || !service_id || !date || !time) {
    return res.status(400).json({ error: 'Champs obligatoires manquants' });
  }

  const service = db.prepare('SELECT * FROM services WHERE id = ? AND tenant_id = ?').get(service_id, t.id);
  if (!service) return res.status(404).json({ error: 'Service introuvable' });

  // Auto-assign barber si "n'importe lequel"
  if (!barber_id) {
    const dayOfWeek = new Date(date + 'T12:00:00').getDay();
    const [rh, rm] = time.split(':').map(Number);
    const reqStart = rh*60+rm, reqEnd = reqStart + service.duration;
    const candidates = db.prepare('SELECT id FROM barbers WHERE tenant_id = ? AND active = 1').all(t.id);
    for (const c of candidates) {
      const h = db.prepare('SELECT * FROM working_hours WHERE barber_id = ? AND day_of_week = ? AND is_closed = 0 AND tenant_id = ?').get(c.id, dayOfWeek, t.id);
      if (!h) continue;
      const conflicts = db.prepare(`SELECT a.time, s.duration FROM appointments a JOIN services s ON a.service_id=s.id WHERE a.date=? AND a.barber_id=? AND a.tenant_id=? AND a.status!='cancelled'`).all(date, c.id, t.id);
      const busy = conflicts.some(a => { const [ah,am]=a.time.split(':').map(Number),as_=ah*60+am,ae=as_+a.duration; return reqStart<ae&&reqEnd>as_; });
      if (!busy) { barber_id = c.id; break; }
    }
    if (!barber_id) return res.status(409).json({ error: 'Aucun barbier disponible pour ce créneau' });
  }

  let client = db.prepare('SELECT * FROM clients WHERE phone = ? AND tenant_id = ?').get(client_phone, t.id);
  if (!client) {
    const r = db.prepare('INSERT INTO clients (name, phone, email, tenant_id) VALUES (?, ?, ?, ?)').run(client_name, client_phone, client_email || null, t.id);
    client = { id: r.lastInsertRowid };
  }

  const barber = db.prepare('SELECT * FROM barbers WHERE id = ? AND tenant_id = ?').get(barber_id, t.id);
  if (!barber) return res.status(404).json({ error: 'Barbier introuvable' });

  const appt = db.prepare('INSERT INTO appointments (client_id, barber_id, service_id, date, time, notes, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?)').run(client.id, barber_id, service_id, date, time, notes || null, t.id);

  // Rappel SMS 24h avant
  const apptDT = new Date(`${date}T${time}`);
  apptDT.setHours(apptDT.getHours() - 24);
  const reminderTime = apptDT.toISOString().slice(0,16).replace('T',' ');
  const smsMsg = `[${t.name}] Rappel: votre RDV "${service.name}" est demain ${date} à ${time} avec ${barber.name}. Pour annuler: ${t.phone || ''}`;
  db.prepare('INSERT INTO reminders (client_id, appointment_id, message, channel, scheduled_at, tenant_id) VALUES (?, ?, ?, ?, ?, ?)').run(client.id, appt.lastInsertRowid, smsMsg, 'sms', reminderTime, t.id);

  // SMS confirmation immédiate
  if (guardSmsQuota(t.id)) {
    sendSMS(client_phone, `[${t.name}] Réservation confirmée! ${service.name} le ${date} à ${time} avec ${barber.name}.`, t).then(() => incrementSmsUsage(t.id)).catch(()=>{});
  }
  if (client_email) {
    const html = confirmationEmailHTML({ clientName: client_name, service: service.name, barber: barber.name, date, time, price: service.price.toFixed(2) }, t.name, t.phone, t.address);
    sendEmail(client_email, `Confirmation – ${t.name}`, html, t).catch(()=>{});
  }

  res.json({ id: appt.lastInsertRowid, message: 'Rendez-vous créé avec succès' });
});

module.exports = router;
