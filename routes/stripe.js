const express = require('express');
const router = express.Router();
const db = require('../database');
const { requireAuth } = require('../middleware/tenantAuth');
const { PLANS } = require('../utils/plans');

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.includes('sk_xxx')) return null;
  return require('stripe')(process.env.STRIPE_SECRET_KEY);
}

// POST /api/stripe/webhook (pas d'auth)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.json({ received: true });

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch(e) {
    return res.status(400).json({ error: e.message });
  }

  const obj = event.data.object;
  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.created') {
    const planMeta = obj.items?.data?.[0]?.price?.metadata?.plan || 'starter';
    const limits = PLANS[planMeta] || PLANS.starter;
    await db.prepare('UPDATE tenants SET plan = ?, plan_status = ?, stripe_subscription_id = ?, current_period_end = ? WHERE stripe_customer_id = ?')
      .run(
        planMeta,
        obj.status === 'active' || obj.status === 'trialing' ? obj.status : 'past_due',
        obj.id,
        new Date(obj.current_period_end * 1000).toISOString().slice(0,10),
        obj.customer
      );
  }
  if (event.type === 'customer.subscription.deleted') {
    await db.prepare("UPDATE tenants SET plan_status = 'cancelled' WHERE stripe_customer_id = ?").run(obj.customer);
  }
  if (event.type === 'invoice.payment_failed') {
    await db.prepare("UPDATE tenants SET plan_status = 'past_due' WHERE stripe_customer_id = ?").run(obj.customer);
  }
  if (event.type === 'invoice.payment_succeeded') {
    await db.prepare("UPDATE tenants SET plan_status = 'active' WHERE stripe_customer_id = ?").run(obj.customer);
  }

  res.json({ received: true });
});

// GET /api/admin/billing
router.get('/', requireAuth, (req, res) => {
  const t = req.tenant;
  const daysLeft = t.trial_ends_at ? Math.max(0, Math.ceil((new Date(t.trial_ends_at) - new Date()) / (1000*60*60*24))) : 0;
  res.json({
    plan: t.plan, plan_status: t.plan_status,
    trial_ends_at: t.trial_ends_at, days_left_trial: daysLeft,
    current_period_end: t.current_period_end,
    stripe_customer_id: t.stripe_customer_id
  });
});

// POST /api/admin/billing/portal
router.post('/portal', requireAuth, async (req, res) => {
  const stripe = getStripe();
  if (!stripe || !req.tenant.stripe_customer_id) return res.status(400).json({ error: 'Stripe non configuré' });
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: req.tenant.stripe_customer_id,
      return_url: `${process.env.APP_URL || 'http://localhost:3000'}/admin`
    });
    res.json({ url: session.url });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/admin/billing/checkout
router.post('/checkout', requireAuth, async (req, res) => {
  const stripe = getStripe();
  if (!stripe) return res.status(400).json({ error: 'Stripe non configuré' });
  const { plan } = req.body;
  const priceId = process.env[`STRIPE_PRICE_${plan?.toUpperCase()}`];
  if (!priceId) return res.status(400).json({ error: 'Plan invalide' });
  try {
    const session = await stripe.checkout.sessions.create({
      customer: req.tenant.stripe_customer_id,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.APP_URL || 'http://localhost:3000'}/admin?subscribed=1`,
      cancel_url: `${process.env.APP_URL || 'http://localhost:3000'}/admin`,
      metadata: { tenantId: String(req.tenantId) }
    });
    res.json({ url: session.url });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
