// build.js — baixa uv.bundle.js e uv.handler.js do CDN no build do Vercel
const https = require("https");
const fs    = require("fs");
const path  = require("path");

const UV_VERSION = "2.0.0";
const BASE_URL   = `https://cdn.jsdelivr.net/npm/@titaniumnetwork-dev/ultraviolet@${UV_VERSION}/dist`;
const DEST       = path.join(__dirname, "public", "uv");

if (!fs.existsSync(DEST)) fs.mkdirSync(DEST, { recursive: true });

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest);
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      res.pipe(file);
      file.on("finish", () => { file.close(); resolve(); });
    }).on("error", err => { fs.unlinkSync(dest); reject(err); });
  });
}

(async () => {
  const files = ["uv.bundle.js", "uv.handler.js"];
  for (const f of files) {
    const url  = `${BASE_URL}/${f}`;
    const dest = path.join(DEST, f);
    if (fs.existsSync(dest)) {
      console.log(`✔ Already exists: ${f}`);
      continue;
    }
    console.log(`⬇ Downloading ${f}...`);
    await download(url, dest);
    console.log(`✔ Done: ${f}`);
  }
  console.log("✅ Build complete");
})();
