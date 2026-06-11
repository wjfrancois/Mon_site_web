const { getPlan, isWithinLimit } = require('../utils/plans');
const db = require('../database');

function guardPdfReports(req, res, next) {
  const plan = getPlan(req.tenant?.plan);
  if (!plan.pdfReports) return res.status(403).json({ error: 'Rapports PDF disponibles à partir du plan Pro', upgrade: true });
  next();
}

async function guardBarberLimit(req, res, next) {
  if (req.method !== 'POST') return next();
  const plan = getPlan(req.tenant?.plan);
  if (plan.maxBarbers === -1) return next();
  const count = await db.prepare('SELECT COUNT(*) as c FROM barbers WHERE tenant_id = ? AND active = 1').get(req.tenantId);
  if (!isWithinLimit(count.c, plan.maxBarbers)) {
    return res.status(403).json({ error: `Limite de ${plan.maxBarbers} barbier(s) atteinte pour votre plan`, upgrade: true });
  }
  next();
}

async function guardSmsQuota(tenantId) {
  const tenant = await db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId);
  const plan = getPlan(tenant?.plan);
  const now = new Date().toISOString().slice(0,7);
  if (tenant.sms_reset_date !== now) {
    await db.prepare('UPDATE tenants SET sms_used_this_month = 0, sms_reset_date = ? WHERE id = ?').run(now, tenantId);
    return true;
  }
  return isWithinLimit(tenant.sms_used_this_month, plan.smsMonth);
}

async function incrementSmsUsage(tenantId) {
  await db.prepare('UPDATE tenants SET sms_used_this_month = sms_used_this_month + 1 WHERE id = ?').run(tenantId);
}

module.exports = { guardPdfReports, guardBarberLimit, guardSmsQuota, incrementSmsUsage };
