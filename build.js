const fs   = require("fs");
const path = require("path");

const dest = path.join(__dirname, "public", "uv");
if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

const uvDist = path.join(__dirname, "node_modules", "@titaniumnetwork-dev", "ultraviolet", "dist");
const bareDist = path.join(__dirname, "node_modules", "@mercuryworkshop", "bare-mux", "dist");

const copies = [
  [path.join(uvDist, "uv.bundle.js"),  path.join(dest, "uv.bundle.js")],
  [path.join(uvDist, "uv.handler.js"), path.join(dest, "uv.handler.js")],
  [path.join(bareDist, "bare.cjs"),    path.join(dest, "bare.cjs")],
];

copies.forEach(([src, dst]) => {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dst);
    console.log("✔ Copied", path.basename(dst));
  } else {
    console.warn("⚠ Not found:", src);
  }
});

console.log("✅ Build complete");
