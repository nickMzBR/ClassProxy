const fs = require("fs");
const path = require("path");

const uvDist = path.join(__dirname, "..", "node_modules", "@titaniumnetwork-dev", "ultraviolet", "dist");
const dest = path.join(__dirname, "..", "public", "uv");

if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

const files = ["uv.bundle.js", "uv.handler.js", "uv.sw.js"];

files.forEach((file) => {
  const src = path.join(uvDist, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(dest, file));
    console.log(`✔ Copied ${file}`);
  } else {
    console.warn(`⚠ Not found: ${file}`);
  }
});

// Copy bare-mux client
const bareMuxPath = path.join(__dirname, "..", "node_modules", "@mercuryworkshop", "bare-mux", "dist", "bare.cjs");
if (fs.existsSync(bareMuxPath)) {
  fs.copyFileSync(bareMuxPath, path.join(dest, "bare.cjs"));
  console.log("✔ Copied bare.cjs");
}

console.log("✅ UV files installed to public/uv/");
