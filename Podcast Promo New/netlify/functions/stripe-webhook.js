const crypto = require('crypto');

/* ── Stripe signature verification (no SDK needed) ──────── */
function verifyStripeSignature(rawBody, sigHeader, secret) {
  const parts = {};
  sigHeader.split(',').forEach(p => { const [k, v] = p.split('='); parts[k] = v; });
  const { t, v1 } = parts;
  if (!t || !v1) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${t}.${rawBody}`)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(v1, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

/* ── Handler ─────────────────────────────────────────────── */
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not set');
    return { statusCode: 500, body: 'Webhook secret not configured' };
  }

  const rawBody = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;

  const sig = event.headers['stripe-signature'] || '';
  if (!verifyStripeSignature(rawBody, sig, webhookSecret)) {
    console.error('Invalid Stripe signature');
    return { statusCode: 400, body: 'Invalid signature' };
  }

  const stripeEvent = JSON.parse(rawBody);

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object;
    console.log('Payment confirmed:', session.id, session.customer_email);
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
