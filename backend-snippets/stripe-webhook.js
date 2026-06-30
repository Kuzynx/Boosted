// =============================================================================
//  OPTIONAL — Stripe → Firestore billing-status sync (Cloud Function)
//
//  This file is NOT deployed by this (hosting-only) repo. It is a ready-to-paste
//  Cloud Function for the Firebase project that holds your client data. With it,
//  a client's `billingStatus` in the Client Manager updates automatically when
//  their subscription changes in Stripe. Without it, you can still set billing
//  status by hand in the dashboard.
//
//  It matches a Stripe Customer to a client by EMAIL, so the email on the
//  client record must match the email they pay with.
//
//  ---- Deploy (in your functions project, NOT this repo) --------------------
//   1.  npm i stripe firebase-admin firebase-functions
//   2.  Set secrets:
//         firebase functions:secrets:set STRIPE_SECRET_KEY
//         firebase functions:secrets:set STRIPE_WEBHOOK_SECRET
//   3.  Add this function to your codebase and deploy ONLY it (so you don't
//       disturb other functions like shareLink):
//         firebase deploy --only functions:stripeWebhook
//   4.  In Stripe → Developers → Webhooks, add an endpoint pointing at the
//       function URL, subscribed to:
//         customer.subscription.created, customer.subscription.updated,
//         customer.subscription.deleted, invoice.payment_failed
//       Copy its signing secret into STRIPE_WEBHOOK_SECRET.
//   5.  Test in Stripe TEST mode first (Stripe CLI: `stripe listen` /
//       `stripe trigger customer.subscription.updated`).
// =============================================================================

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const Stripe = require('stripe');

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');

// Stripe subscription.status  ->  Client Manager billingStatus
function mapStatus(s) {
  switch (s) {
    case 'active': return 'Active';
    case 'trialing': return 'Trialing';
    case 'past_due':
    case 'unpaid': return 'Past due';
    case 'canceled':
    case 'incomplete_expired': return 'Canceled';
    default: return '';
  }
}

async function setBillingByEmail(email, billingStatus) {
  if (!email) return;
  const snap = await db.collection('webClients')
    .where('email', '==', email.toLowerCase()).get();
  const writes = [];
  snap.forEach(doc => writes.push(doc.ref.update({ billingStatus })));
  await Promise.all(writes);
}

exports.stripeWebhook = onRequest(
  { secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] },
  async (req, res) => {
    const stripe = new Stripe(STRIPE_SECRET_KEY.value());
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET.value());
    } catch (err) {
      console.error('Webhook signature verification failed', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      if (event.type.startsWith('customer.subscription.')) {
        const sub = event.data.object;
        const customer = await stripe.customers.retrieve(sub.customer);
        const status = event.type === 'customer.subscription.deleted'
          ? 'Canceled' : mapStatus(sub.status);
        await setBillingByEmail(customer.email, status);
      } else if (event.type === 'invoice.payment_failed') {
        const invoice = event.data.object;
        await setBillingByEmail(invoice.customer_email, 'Past due');
      }
    } catch (err) {
      console.error('Handler error', err);
      return res.status(500).send('handler error');
    }

    res.json({ received: true });
  }
);
