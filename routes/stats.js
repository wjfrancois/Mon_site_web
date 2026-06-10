const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/dashboard', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const thisMonth = today.slice(0, 7);

  const todayAppts = db.prepare(`SELECT COUNT(*) as c FROM appointments WHERE date = ? AND status != 'cancelled'`).get(today);
  const monthAppts = db.prepare(`SELECT COUNT(*) as c FROM appointments WHERE strftime('%Y-%m', date) = ? AND status != 'cancelled'`).get(thisMonth);
  const monthRevenue = db.prepare(`SELECT COALESCE(SUM(t.amount), 0) as total FROM transactions t WHERE type = 'income' AND strftime('%Y-%m', date) = ?`).get(thisMonth);
  const totalClients = db.prepare('SELECT COUNT(*) as c FROM clients').get();
  const pendingAppts = db.prepare(`SELECT COUNT(*) as c FROM appointments WHERE date >= ? AND status = 'pending'`).get(today);

  const upcomingToday = db.prepare(`
    SELECT a.*, c.name as client_name, c.phone as client_phone,
           b.name as barber_name, b.color as barber_color,
           s.name as service_name, s.duration, s.price
    FROM appointments a
    JOIN clients c ON a.client_id = c.id
    JOIN barbers b ON a.barber_id = b.id
    JOIN services s ON a.service_id = s.id
    WHERE a.date = ? AND a.status != 'cancelled'
    ORDER BY a.time ASC
  `).all(today);

  const popularServices = db.prepare(`
    SELECT s.name, COUNT(*) as count, SUM(s.price) as revenue
    FROM appointments a JOIN services s ON a.service_id = s.id
    WHERE a.status = 'completed'
    GROUP BY s.id ORDER BY count DESC LIMIT 5
  `).all();

  const barberStats = db.prepare(`
    SELECT b.name, b.color, COUNT(a.id) as appointments,
           SUM(CASE WHEN a.status = 'completed' THEN s.price ELSE 0 END) as revenue
    FROM barbers b LEFT JOIN appointments a ON b.id = a.barber_id
    LEFT JOIN services s ON a.service_id = s.id
    WHERE b.active = 1
    GROUP BY b.id ORDER BY revenue DESC
  `).all();

  const monthlyRevenue = db.prepare(`
    SELECT strftime('%Y-%m', date) as month,
           SUM(CASE WHEN type='income' THEN amount ELSE 0 END) as income
    FROM transactions WHERE strftime('%Y', date) = strftime('%Y', 'now')
    GROUP BY month ORDER BY month ASC
  `).all();

  const recentClients = db.prepare(`
    SELECT c.*, MAX(a.date) as last_visit, COUNT(a.id) as visit_count
    FROM clients c JOIN appointments a ON c.id = a.client_id
    WHERE a.status = 'completed'
    GROUP BY c.id ORDER BY last_visit DESC LIMIT 5
  `).all();

  res.json({
    today_appointments: todayAppts.c,
    month_appointments: monthAppts.c,
    month_revenue: monthRevenue.total,
    total_clients: totalClients.c,
    pending_appointments: pendingAppts.c,
    upcoming_today: upcomingToday,
    popular_services: popularServices,
    barber_stats: barberStats,
    monthly_revenue: monthlyRevenue,
    recent_clients: recentClients
  });
});

router.get('/reports', (req, res) => {
  const { start_date, end_date } = req.query;
  if (!start_date || !end_date) return res.status(400).json({ error: 'Dates requises' });

  const appointments = db.prepare(`
    SELECT a.date, a.time, a.status,
           c.name as client, c.phone as client_phone,
           b.name as barber,
           s.name as service, s.price, s.duration
    FROM appointments a
    JOIN clients c ON a.client_id = c.id
    JOIN barbers b ON a.barber_id = b.id
    JOIN services s ON a.service_id = s.id
    WHERE a.date BETWEEN ? AND ? AND a.status != 'cancelled'
    ORDER BY a.date ASC, a.time ASC
  `).all(start_date, end_date);

  const transactions = db.prepare(`
    SELECT * FROM transactions WHERE date BETWEEN ? AND ?
    ORDER BY date ASC
  `).all(start_date, end_date);

  const summary = db.prepare(`
    SELECT
      COUNT(DISTINCT CASE WHEN a.status='completed' THEN a.id END) as completed,
      COUNT(DISTINCT CASE WHEN a.status='no-show' THEN a.id END) as no_shows,
      COUNT(DISTINCT a.client_id) as unique_clients
    FROM appointments a WHERE a.date BETWEEN ? AND ?
  `).get(start_date, end_date);

  const income = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);

  res.json({
    period: { start: start_date, end: end_date },
    appointments,
    transactions,
    summary: { ...summary, total_income: income, total_expense: expense, net: income - expense }
  });
});

module.exports = router;
