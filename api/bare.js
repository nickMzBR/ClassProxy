// api/bare.js — Bare Server v3 for Vercel Serverless
const http  = require("http");
const https = require("https");
const { URL } = require("url");
const zlib  = require("zlib");

const HOP_HEADERS = new Set([
  "connection","keep-alive","transfer-encoding","te","trailer",
  "upgrade","proxy-authorization","proxy-authenticate","proxy-connection"
]);

function readBody(stream) {
  return new Promise((res, rej) => {
    const chunks = [];
    stream.on("data", c => chunks.push(c));
    stream.on("end",  () => res(Buffer.concat(chunks)));
    stream.on("error", rej);
  });
}

function request(url, options, body) {
  return new Promise((res, rej) => {
    const parsed  = new URL(url);
    const isHttps = parsed.protocol === "https:";
    const mod     = isHttps ? https : http;
    const req = mod.request({
      hostname: parsed.hostname,
      port:     parsed.port || (isHttps ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   options.method,
      headers:  options.headers,
      timeout:  30000,
      rejectUnauthorized: false,
    }, res);
    req.on("error",   rej);
    req.on("timeout", () => { req.destroy(); rej(new Error("Upstream timeout")); });
    if (body && body.length) req.write(body);
    req.end();
  });
}

module.exports = async (req, res) => {
  // CORS — bare server must be open
  res.setHeader("Access-Control-Allow-Origin",   "*");
  res.setHeader("Access-Control-Allow-Headers",  "*");
  res.setHeader("Access-Control-Allow-Methods",  "*");
  res.setHeader("Access-Control-Expose-Headers", "*");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  // ── Bare v3 meta ──
  if (req.method === "GET" && (!req.url || req.url === "/" || req.url === "")) {
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({
      versions: ["v3"],
      language: "NodeJS",
      memoryUsage: 0,
      maintainer: {},
      project: { name: "class-unblocker", version: "4.0.0" },
    }));
  }

  // ── Parse Bare request ──
  let targetUrl, forwardHeaders, passHeaders, cacheKey;

  try {
    const rawUrl = req.headers["x-bare-url"];
    if (!rawUrl) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ code: "MISSING_BARE_URL", id: "bare", message: "Missing X-Bare-URL" }));
    }

    targetUrl    = rawUrl;
    forwardHeaders = JSON.parse(req.headers["x-bare-forward-headers"] || "[]");
    passHeaders    = JSON.parse(req.headers["x-bare-pass-headers"]    || "[]");
    cacheKey       = req.headers["x-bare-cache-key"] || null;

    new URL(targetUrl); // validate
  } catch(e) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ code: "INVALID_BARE_HEADER", id: "bare", message: e.message }));
  }

  // Build upstream headers
  const upstreamHeaders = {};
  for (const h of forwardHeaders) {
    if (req.headers[h.toLowerCase()]) {
      upstreamHeaders[h] = req.headers[h.toLowerCase()];
    }
  }

  // Read request body
  let body = Buffer.alloc(0);
  if (!["GET","HEAD"].includes(req.method)) {
    body = await readBody(req);
  }

  try {
    const upstream = await request(targetUrl, {
      method:  req.method,
      headers: upstreamHeaders,
    }, body);

    // Build pass headers
    const resHeaders = {};
    for (const h of passHeaders) {
      const val = upstream.headers[h.toLowerCase()];
      if (val) resHeaders[h] = Array.isArray(val) ? val.join(", ") : val;
    }

    // Expose bare response metadata
    res.setHeader("X-Bare-Status",      String(upstream.statusCode));
    res.setHeader("X-Bare-Status-Text", upstream.statusMessage || "");
    res.setHeader("X-Bare-Headers",     JSON.stringify(
      Object.fromEntries(
        Object.entries(upstream.headers)
          .filter(([k]) => !HOP_HEADERS.has(k.toLowerCase()))
          .map(([k,v]) => [k, Array.isArray(v) ? v.join(", ") : v])
      )
    ));

    for (const [k, v] of Object.entries(resHeaders)) {
      try { res.setHeader(k, v); } catch {}
    }

    res.statusCode = 200;
    upstream.pipe(res);
  } catch(e) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ code: "CONNECTION_FAILED", id: "connection", message: e.message }));
  }
};
