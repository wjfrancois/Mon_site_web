const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/transactions', (req, res) => {
  const { month, type } = req.query;
  let query = 'SELECT * FROM transactions WHERE 1=1';
  const params = [];
  if (month) { query += ' AND strftime("%Y-%m", date) = ?'; params.push(month); }
  if (type) { query += ' AND type = ?'; params.push(type); }
  query += ' ORDER BY date DESC, created_at DESC';
  res.json(db.prepare(query).all(...params));
});

router.post('/transactions', (req, res) => {
  const { type, category, description, amount, date } = req.body;
  if (!type || !category || !description || amount === undefined || !date) {
    return res.status(400).json({ error: 'Champs obligatoires manquants' });
  }
  const result = db.prepare('INSERT INTO transactions (type, category, description, amount, date) VALUES (?, ?, ?, ?, ?)').run(type, category, description, amount, date);
  res.json({ id: result.lastInsertRowid });
});

router.delete('/transactions/:id', (req, res) => {
  db.prepare('DELETE FROM transactions WHERE id = ?').run(req.params.id);
  res.json({ message: 'Transaction supprimée' });
});

router.get('/summary', (req, res) => {
  const { period } = req.query;
  let dateFilter = '';
  const now = new Date();

  if (period === 'today') {
    dateFilter = `AND date = '${now.toISOString().slice(0, 10)}'`;
  } else if (period === 'week') {
    const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
    dateFilter = `AND date >= '${weekAgo.toISOString().slice(0, 10)}'`;
  } else if (period === 'month') {
    dateFilter = `AND strftime('%Y-%m', date) = '${now.toISOString().slice(0, 7)}'`;
  } else if (period === 'year') {
    dateFilter = `AND strftime('%Y', date) = '${now.getFullYear()}'`;
  }

  const income = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'income' ${dateFilter}`).get();
  const expense = db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'expense' ${dateFilter}`).get();
  const byCategory = db.prepare(`
    SELECT type, category, SUM(amount) as total, COUNT(*) as count
    FROM transactions WHERE 1=1 ${dateFilter}
    GROUP BY type, category ORDER BY total DESC
  `).all();

  const dailyRevenue = db.prepare(`
    SELECT date, SUM(CASE WHEN type='income' THEN amount ELSE 0 END) as income,
           SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) as expense
    FROM transactions WHERE 1=1 ${dateFilter}
    GROUP BY date ORDER BY date ASC
  `).all();

  res.json({
    total_income: income.total,
    total_expense: expense.total,
    net: income.total - expense.total,
    by_category: byCategory,
    daily_revenue: dailyRevenue
  });
});

module.exports = router;
