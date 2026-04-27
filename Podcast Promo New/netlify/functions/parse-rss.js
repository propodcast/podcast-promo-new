exports.handler = async (event) => {
  const url = event.queryStringParameters?.url;
  if (!url) return { statusCode: 400, body: 'Missing url parameter' };

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PodReach/1.0; +https://podreach.com.au)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`Feed returned ${res.status}`);
    const xml = await res.text();

    const get = (block, tag, attr) => {
      if (attr) {
        const m = block.match(new RegExp(`<${tag}[^>]+${attr}="([^"]*)"`, 'i'));
        return m?.[1]?.trim() || null;
      }
      const m = block.match(new RegExp(`<${tag}(?:[^>]*)>([\\s\\S]*?)<\\/${tag}>`, 'i'));
      if (!m) return null;
      return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
    };

    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
      const b = match[1];

      const title       = get(b, 'title') || 'Untitled';
      const description = get(b, 'description') || get(b, 'itunes:summary') || '';
      const pubDate     = get(b, 'pubDate');
      const durationStr = get(b, 'itunes:duration');
      const guid        = get(b, 'guid');
      const enclosureUrl= get(b, 'enclosure', 'url');
      const image       = get(b, 'itunes:image', 'href');

      let duration = 0;
      if (durationStr) {
        const parts = durationStr.split(':').map(Number);
        if (parts.length === 3)      duration = parts[0]*3600 + parts[1]*60 + parts[2];
        else if (parts.length === 2) duration = parts[0]*60  + parts[1];
        else                         duration = Number(durationStr) || 0;
      }

      let datePublished = 0;
      if (pubDate) {
        const d = new Date(pubDate);
        if (!isNaN(d)) datePublished = Math.floor(d.getTime() / 1000);
      }

      items.push({ title, description, datePublished, duration, enclosureUrl, image, guid });
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300', // 5-min cache
      },
      body: JSON.stringify({ items }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
