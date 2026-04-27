const https = require('https');

/* Google Apps Script returns a 302 redirect on GET too */
function getWithRedirect(urlStr) {
  return new Promise((resolve, reject) => {
    function doRequest(hostname, path) {
      const req = https.request(
        { hostname, path, method: 'GET' },
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            try {
              const loc = new URL(res.headers.location);
              doRequest(loc.hostname, loc.pathname + loc.search);
            } catch(e) { reject(e); }
            return;
          }
          let raw = '';
          res.on('data', chunk => { raw += chunk; });
          res.on('end', () => resolve(raw));
        }
      );
      req.on('error', reject);
      req.end();
    }

    try {
      const u = new URL(urlStr);
      doRequest(u.hostname, u.pathname + u.search);
    } catch(e) { reject(e); }
  });
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let email;
  try { ({ email } = JSON.parse(event.body || '{}')); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  if (!email || !email.includes('@')) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Valid email required' }) };
  }

  const scriptUrl = process.env.GOOGLE_SCRIPT_URL;
  if (!scriptUrl) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'GOOGLE_SCRIPT_URL not set' }) };
  }

  try {
    const raw  = await getWithRedirect(`${scriptUrl}?email=${encodeURIComponent(email)}`);
    const data = JSON.parse(raw);
    return { statusCode: 200, headers, body: JSON.stringify(Array.isArray(data) ? data : []) };
  } catch(err) {
    console.error('Sheets read failed:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
