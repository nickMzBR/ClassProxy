/**
 * scripts/build.js
 * Copies Ultraviolet dist files into public/uv/ so they are served statically.
 * Run: node scripts/build.js
 */

const fs   = require('fs');
const path = require('path');

const SRC  = path.resolve(__dirname, '../node_modules/@titaniumnetwork-dev/ultraviolet/dist');
const DEST = path.resolve(__dirname, '../public/uv');

if (!fs.existsSync(SRC)) {
  console.error('[build] ERROR: UV package not found. Run `npm install` first.');
  process.exit(1);
}

fs.mkdirSync(DEST, { recursive: true });

const files = fs.readdirSync(SRC);
let copied = 0;

files.forEach(file => {
  const from = path.join(SRC, file);
  const to   = path.join(DEST, file);
  fs.copyFileSync(from, to);
  console.log(`[build] Copied ${file}`);
  copied++;
});

console.log(`\n[build] ✅  Done — ${copied} file(s) copied to public/uv/`);