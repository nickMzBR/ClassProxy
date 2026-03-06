/**
 * server.js
 * Local development server for Class Unblocker.
 *
 * - Serves everything in /public as static files
 * - Mounts a bare server at /bare/ so UV can proxy requests
 *
 * Usage:
 *   npm install
 *   node scripts/build.js   ← copies UV dist files to public/uv/
 *   node server.js           ← starts on http://localhost:8080
 */

const path        = require('path');
const http        = require('http');
const express     = require('express');
const { createBareServer } = require('@tomphttp/bare-server-node');

const PORT   = process.env.PORT || 8080;
const PUBLIC = path.join(__dirname, 'public');

// ── Express app ──────────────────────────────────────────────────────────────
const app = express();

// Serve static files (index.html, uv/*.js, etc.)
app.use(express.static(PUBLIC));

// SPA fallback — any unmatched route returns index.html
app.use((_req, res) => {
  res.sendFile(path.join(PUBLIC, 'index.html'));
});

// ── Bare server (proxies HTTP/WebSocket requests for UV) ─────────────────────
const bareServer = createBareServer('/bare/');

// ── Combined HTTP server ─────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  if (bareServer.shouldRoute(req)) {
    bareServer.routeRequest(req, res);
  } else {
    app(req, res);
  }
});

// Handle WebSocket upgrades for bare server
server.on('upgrade', (req, socket, head) => {
  if (bareServer.shouldRoute(req)) {
    bareServer.routeUpgrade(req, socket, head);
  } else {
    socket.destroy();
  }
});

server.listen(PORT, () => {
  console.log(`\n🚀  Class Unblocker running at http://localhost:${PORT}`);
  console.log(`    Bare server  → http://localhost:${PORT}/bare/`);
  console.log(`    UV prefix    → http://localhost:${PORT}/service/\n`);
});