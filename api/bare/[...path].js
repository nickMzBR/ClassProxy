/**
 * api/bare/[...path].js
 * Bare server implementation for Vercel serverless functions.
 * Acts as the HTTP tunnel that UV's service worker communicates with.
 */

const http = require("http");
const https = require("https");
const { URL } = require("url");

function parseHeaders(raw) {
  const headers = {};
  for (const [key, value] of Object.entries(raw)) {
    const lower = key.toLowerCase();
    // Skip hop-by-hop headers
    if (["connection", "keep-alive", "transfer-encoding", "te",
         "trailer", "upgrade", "proxy-authorization", "proxy-authenticate"].includes(lower)) {
      continue;
    }
    headers[lower] = value;
  }
  return headers;
}

module.exports = async (req, res) => {
  // Handle CORS preflight
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "*");
  res.setHeader("Access-Control-Expose-Headers", "*");
  res.setHeader("Access-Control-Max-Age", "7200");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  // ── Bare v2 meta endpoint ──
  if (req.method === "GET" && (req.url === "/api/bare" || req.url === "/api/bare/")) {
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify({
      versions: ["v1", "v2"],
      language: "NodeJS",
      memoryUsage: 0,
      maintainer: { email: "", website: "" },
      project: { name: "class-unblocker", repository: "", version: "2.0.0" },
    }));
  }
