const https = require('https');

function stripeGet(path, auth) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.stripe.com',
        path,
        method:  'GET',
        headers: { 'Authorization': `Basic ${auth}` },
      },
      (res) => {
        let raw = '';
        res.on('data', chunk => { raw += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(raw)); }
          catch(e) { reject(e); }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let sessionId;
  try { ({ sessionId } = JSON.parse(event.body || '{}')); }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return { statusCode: 500, body: JSON.stringify({ error: 'Not configured' }) };

  try {
    const auth = Buffer.from(secretKey + ':').toString('base64');

    // Expand discounts.promotion_code so we get the code string in one call
    const session = await stripeGet(
      `/v1/checkout/sessions/${sessionId}?expand%5B0%5D=discounts.promotion_code&expand%5B1%5D=total_details.breakdown`,
      auth
    );

    // Log everything discount-related for diagnostics
    console.log('FULL discounts field:', JSON.stringify(session.discounts));
    console.log('session.discount (singular):', JSON.stringify(session.discount));
    console.log('total_details.breakdown.discounts:', JSON.stringify(session.total_details?.breakdown?.discounts));

    let promoCode = '';

    // 1. session.discounts array (current Stripe API — each item has promotion_code field)
    if (Array.isArray(session.discounts) && session.discounts.length > 0) {
      for (const d of session.discounts) {
        const pc = d.promotion_code;          // may be string ID or expanded object
        if (!pc) continue;
        if (typeof pc === 'object') {
          promoCode = pc.code || '';           // expanded: { id, code, ... }
        } else {
          // Still an ID string — fetch separately
          const promo = await stripeGet(`/v1/promotion_codes/${pc}`, auth);
          promoCode = promo.code || '';
        }
        if (promoCode) break;
      }
    }

    // 2. total_details.breakdown.discounts (expand fallback)
    if (!promoCode) {
      const bkDiscounts = session.total_details?.breakdown?.discounts || [];
      for (const d of bkDiscounts) {
        const pc = d.discount?.promotion_code;
        if (!pc) continue;
        if (typeof pc === 'object') {
          promoCode = pc.code || '';
        } else {
          const promo = await stripeGet(`/v1/promotion_codes/${pc}`, auth);
          promoCode = promo.code || '';
        }
        if (promoCode) break;
      }
    }

    // 3. session.discount singular (older API versions)
    if (!promoCode) {
      const pc = session.discount?.promotion_code;
      if (pc) {
        if (typeof pc === 'object') {
          promoCode = pc.code || '';
        } else {
          const promo = await stripeGet(`/v1/promotion_codes/${pc}`, auth);
          promoCode = promo.code || '';
        }
      }
    }

    console.log('Final promoCode:', promoCode);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ promoCode }),
    };
  } catch(err) {
    console.error('get-session error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
