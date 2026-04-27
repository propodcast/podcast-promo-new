const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const {
    email, totalBudget, podcastTitle, episodeCount, plays, audience,
    episodeData, rssUrl, campaignType, cpcLimit, countryTarget, auDetails,
  } = payload;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const origin    = event.headers.origin || 'https://podreach.com.au';

  if (!secretKey) {
    console.error('STRIPE_SECRET_KEY env var is not set');
    return { statusCode: 500, body: JSON.stringify({ error: 'Payment not configured — STRIPE_SECRET_KEY missing' }) };
  }

  const amountCents = Math.round(totalBudget * 100);
  const description = `${audience} — ${episodeCount} episode${episodeCount !== 1 ? 's' : ''} of "${podcastTitle}" — ${plays.toLocaleString()} listens`;

  // Compact episode list for metadata (max 490 chars)
  const epDataStr = JSON.stringify(
    (episodeData || []).map(ep => ({
      title: (ep.title || '').substring(0, 80),
      guid:  (ep.guid  || '').substring(0, 80),
    }))
  ).substring(0, 490);

  const params = new URLSearchParams({
    'mode':                                                 'payment',
    'allow_promotion_codes':                                'true',
    'customer_email':                                       email,
    'line_items[0][price_data][currency]':                  'aud',
    'line_items[0][price_data][unit_amount]':               String(amountCents),
    'line_items[0][price_data][product_data][name]':        'Pro Podcast Campaign',
    'line_items[0][price_data][product_data][description]': description,
    'line_items[0][quantity]':                              '1',
    'success_url':  `${origin}/?session_id={CHECKOUT_SESSION_ID}`,
    'cancel_url':   `${origin}/`,
    // Full campaign metadata — picked up by stripe-webhook.js
    'metadata[username]':           email,
    'metadata[podcast_name]':       (podcastTitle || '').substring(0, 490),
    'metadata[ep_data]':            epDataStr,
    'metadata[rss_url]':            (rssUrl || '').substring(0, 490),
    'metadata[campaign_type]':      campaignType || '',
    'metadata[cpc_limit]':          cpcLimit     || '',
    'metadata[budget]':             `${totalBudget} AUD`,
    'metadata[country_targeting]':  countryTarget || '',
    'metadata[category_targeting]': (auDetails?.interests || 'All').substring(0, 490),
    'metadata[demographic]':        `${auDetails?.gender || 'Everyone'} | ${auDetails?.ages || 'All ages'}`,
    'metadata[age]':                (auDetails?.ages   || 'All').substring(0, 490),
    'metadata[gender]':             auDetails?.gender  || 'Everyone',
    'metadata[income_range]':       (auDetails?.income || 'All incomes').substring(0, 490),
  });

  const body = params.toString();
  const auth = Buffer.from(secretKey + ':').toString('base64');

  return new Promise((resolve) => {
    const req = https.request(
      {
        hostname: 'api.stripe.com',
        path:     '/v1/checkout/sessions',
        method:   'POST',
        headers:  {
          'Authorization':  `Basic ${auth}`,
          'Content-Type':   'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', chunk => { raw += chunk; });
        res.on('end', () => {
          try {
            const data = JSON.parse(raw);
            if (res.statusCode === 200) {
              resolve({
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: data.url }),
              });
            } else {
              console.error('Stripe error:', data);
              resolve({
                statusCode: res.statusCode,
                body: JSON.stringify({ error: data.error?.message || 'Stripe error' }),
              });
            }
          } catch (e) {
            resolve({ statusCode: 500, body: JSON.stringify({ error: 'Parse error' }) });
          }
        });
      }
    );

    req.on('error', (err) => {
      console.error('HTTPS error:', err);
      resolve({ statusCode: 500, body: JSON.stringify({ error: err.message }) });
    });

    req.write(body);
    req.end();
  });
};
