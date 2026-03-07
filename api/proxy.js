const https = require('https');
const http = require('http');
const { URL } = require('url');

// Headers to strip from the proxied response
const BLOCKED_HEADERS = [
  'x-frame-options',
  'content-security-policy',
  'content-security-policy-report-only',
  'x-content-type-options',
  'strict-transport-security',
  'x-xss-protection',
  'permissions-policy',
  'cross-origin-opener-policy',
  'cross-origin-embedder-policy',
  'cross-origin-resource-policy',
];

// Headers to strip from the outgoing request (to the target)
const STRIP_REQUEST_HEADERS = [
  'host',
  'origin',
  'referer',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
  'x-vercel-forwarded-for',
  'x-vercel-id',
];

function resolveUrl(base, relative) {
  try {
    return new URL(relative, base).href;
  } catch {
    return null;
  }
}

function rewriteHtml(html, targetOrigin, proxyBase) {
  // Rewrite absolute and relative URLs in HTML to go through proxy
  // Replace href, src, action attributes pointing to same origin or relative paths
  return html
    .replace(/(href|src|action)=["'](\/?[^"']+)["']/gi, (match, attr, url) => {
      if (url.startsWith('data:') || url.startsWith('javascript:') || url.startsWith('#') || url.startsWith('mailto:')) {
        return match;
      }
      const resolved = resolveUrl(targetOrigin, url);
      if (!resolved) return match;
      // Only proxy same-origin or relative URLs
      const resolvedUrl = new URL(resolved);
      const targetUrl = new URL(targetOrigin);
      if (resolvedUrl.hostname === targetUrl.hostname) {
        return `${attr}="${proxyBase}${encodeURIComponent(resolved)}"`;
      }
      return match;
    });
}

module.exports = async (req, res) => {
  // CORS headers for the proxy itself
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let { url } = req.query;

  if (!url) {
    return res.status(400).json({
      error: 'Missing URL parameter',
      usage: '/api/proxy?url=https://example.com',
    });
  }

  // Auto-prepend https if missing
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

  let targetUrl;
  try {
    targetUrl = new URL(url);
  } catch {
    return res.status(400).json({ error: 'Invalid URL provided' });
  }

  // Build forwarded request headers
  const forwardHeaders = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (!STRIP_REQUEST_HEADERS.includes(key.toLowerCase())) {
      forwardHeaders[key] = value;
    }
  }
  forwardHeaders['host'] = targetUrl.hostname;
  forwardHeaders['referer'] = targetUrl.origin + '/';
  forwardHeaders['accept-encoding'] = 'identity'; // Avoid compressed responses for easy rewriting

  const fetchOptions = {
    method: req.method === 'POST' ? 'POST' : 'GET',
    headers: forwardHeaders,
    redirect: 'follow',
  };

  if (req.method === 'POST') {
    fetchOptions.body = req.body ? JSON.stringify(req.body) : undefined;
  }

  try {
    const response = await fetch(targetUrl.href, fetchOptions);

    // Forward status
    res.status(response.status);

    // Forward and filter headers
    response.headers.forEach((value, key) => {
      const lowerKey = key.toLowerCase();
      if (BLOCKED_HEADERS.includes(lowerKey)) return;
      if (lowerKey === 'transfer-encoding') return;
      if (lowerKey === 'content-encoding') return;
      try {
        res.setHeader(key, value);
      } catch {}
    });

    const contentType = response.headers.get('content-type') || '';

    // For HTML responses, rewrite internal links to go through the proxy
    if (contentType.includes('text/html')) {
      const html = await response.text();
      const proxyBase = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers['x-forwarded-host'] || req.headers['host']}/api/proxy?url=`;
      const rewritten = rewriteHtml(html, targetUrl.origin, proxyBase);

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('X-Proxied-By', 'ClassUnblocker');
      return res.send(rewritten);
    }

    // For all other content, stream the body directly
    const buffer = await response.arrayBuffer();
    res.setHeader('X-Proxied-By', 'ClassUnblocker');
    return res.send(Buffer.from(buffer));

  } catch (err) {
    console.error('Proxy error:', err.message);
    return res.status(502).json({
      error: 'Failed to fetch the requested URL',
      details: err.message,
      url: targetUrl.href,
    });
  }
};
