const http  = require("http");
const https = require("https");
const { URL } = require("url");

const HOP = new Set(["connection","keep-alive","transfer-encoding","te","trailer","upgrade","proxy-authorization","proxy-authenticate","proxy-connection"]);

function readBody(stream) {
  return new Promise((res, rej) => {
    const c = [];
    stream.on("data", d => c.push(d));
    stream.on("end",  () => res(Buffer.concat(c)));
    stream.on("error", rej);
  });
}

function upstream(url, method, headers, body) {
  return new Promise((res, rej) => {
    const p = new URL(url);
    const s = p.protocol === "https:";
    const r = (s ? https : http).request({
      hostname: p.hostname,
      port: p.port || (s ? 443 : 80),
      path: p.pathname + p.search,
      method, headers,
      timeout: 30000,
      rejectUnauthorized: false,
    }, res);
    r.on("error", rej);
    r.on("timeout", () => { r.destroy(); rej(new Error("Timeout")); });
    if (body && body.length) r.write(body);
    r.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "*");
  res.setHeader("Access-Control-Expose-Headers", "*");

  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }

  if (req.method === "GET" && (!req.url || req.url === "/" || req.url === "")) {
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({ versions: ["v3"], language: "NodeJS", project: { name: "class-unblocker" } }));
  }

  const rawUrl = req.headers["x-bare-url"];
  if (!rawUrl) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ code: "MISSING_BARE_URL", message: "Missing X-Bare-URL header" }));
  }

  try { new URL(rawUrl); } catch(e) {
    res.statusCode = 400;
    return res.end(JSON.stringify({ code: "INVALID_URL", message: e.message }));
  }

  const forwardHeaders = JSON.parse(req.headers["x-bare-forward-headers"] || "[]");
  const passHeaders    = JSON.parse(req.headers["x-bare-pass-headers"]    || "[]");

  const upHeaders = {};
  for (const h of forwardHeaders) {
    const val = req.headers[h.toLowerCase()];
    if (val) upHeaders[h] = val;
  }

  let body = Buffer.alloc(0);
  if (!["GET","HEAD"].includes(req.method)) body = await readBody(req);

  try {
    const upRes = await upstream(rawUrl, req.method, upHeaders, body);

    const bareHeaders = {};
    for (const [k, v] of Object.entries(upRes.headers)) {
      if (!HOP.has(k.toLowerCase())) bareHeaders[k] = Array.isArray(v) ? v.join(", ") : v;
    }

    const passOut = {};
    for (const h of passHeaders) {
      const val = upRes.headers[h.toLowerCase()];
      if (val) passOut[h] = Array.isArray(val) ? val.join(", ") : val;
    }

    res.setHeader("X-Bare-Status",      String(upRes.statusCode));
    res.setHeader("X-Bare-Status-Text", upRes.statusMessage || "");
    res.setHeader("X-Bare-Headers",     JSON.stringify(bareHeaders));

    for (const [k, v] of Object.entries(passOut)) {
      try { res.setHeader(k, v); } catch {}
    }

    res.statusCode = 200;
    upRes.pipe(res);
  } catch(e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ code: "CONNECTION_FAILED", message: e.message }));
  }
};
