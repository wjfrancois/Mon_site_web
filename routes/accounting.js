const express = require('express');
const router = express.Router();
const db = require('../database');

router.get('/transactions', async (req, res) => {
  const { month, type } = req.query;
  let query = 'SELECT * FROM transactions WHERE tenant_id = ?';
  const params = [req.tenantId];
  if (month) { query += ' AND substring(date, 1, 7) = ?'; params.push(month); }
  if (type) { query += ' AND type = ?'; params.push(type); }
  query += ' ORDER BY date DESC, created_at DESC';
  res.json(await db.prepare(query).all(...params));
});

router.post('/transactions', async (req, res) => {
  const { type, category, description, amount, date } = req.body;
  if (!type || !category || !description || amount === undefined || !date) {
    return res.status(400).json({ error: 'Champs obligatoires manquants' });
  }
  const result = await db.prepare('INSERT INTO transactions (type, category, description, amount, date, tenant_id) VALUES (?, ?, ?, ?, ?, ?)').run(type, category, description, amount, date, req.tenantId);
  res.json({ id: result.lastInsertRowid });
});

router.delete('/transactions/:id', async (req, res) => {
  await db.prepare('DELETE FROM transactions WHERE id = ? AND tenant_id = ?').run(req.params.id, req.tenantId);
  res.json({ message: 'Transaction supprimée' });
});

router.get('/summary', async (req, res) => {
  const { period } = req.query;
  let dateFilter = '';
  const now = new Date();

  if (period === 'today') {
    dateFilter = `AND date = '${now.toISOString().slice(0, 10)}'`;
  } else if (period === 'week') {
    const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
    dateFilter = `AND date >= '${weekAgo.toISOString().slice(0, 10)}'`;
  } else if (period === 'month') {
    dateFilter = `AND substring(date, 1, 7) = '${now.toISOString().slice(0, 7)}'`;
  } else if (period === 'year') {
    dateFilter = `AND substring(date, 1, 4) = '${now.getFullYear()}'`;
  }

  const income = await db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'income' AND tenant_id = ? ${dateFilter}`).get(req.tenantId);
  const expense = await db.prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'expense' AND tenant_id = ? ${dateFilter}`).get(req.tenantId);
  const byCategory = await db.prepare(`
    SELECT type, category, SUM(amount) as total, COUNT(*) as count
    FROM transactions WHERE tenant_id = ? ${dateFilter}
    GROUP BY type, category ORDER BY total DESC
  `).all(req.tenantId);

  const dailyRevenue = await db.prepare(`
    SELECT date, SUM(CASE WHEN type='income' THEN amount ELSE 0 END) as income,
           SUM(CASE WHEN type='expense' THEN amount ELSE 0 END) as expense
    FROM transactions WHERE tenant_id = ? ${dateFilter}
    GROUP BY date ORDER BY date ASC
  `).all(req.tenantId);

  res.json({
    total_income: income.total,
    total_expense: expense.total,
    net: income.total - expense.total,
    by_category: byCategory,
    daily_revenue: dailyRevenue
  });
});

module.exports = router;
