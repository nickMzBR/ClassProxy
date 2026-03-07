// api/proxy.js — Class Unblocker v3.1
const https = require("https");
const http  = require("http");
const zlib  = require("zlib");
const { URL } = require("url");

const BLOCKED_REQ_HEADERS = new Set(["host","origin","referer","cookie","cf-ray","cf-connecting-ip","x-forwarded-for","x-vercel-id","x-real-ip"]);
const BLOCKED_RES_HEADERS = new Set(["content-security-policy","x-frame-options","strict-transport-security","content-encoding","transfer-encoding","connection","keep-alive","alt-svc"]);

function doFetch(targetUrl, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed  = new URL(targetUrl);
    const isHttps = parsed.protocol === "https:";
    const mod     = isHttps ? https : http;
    const req = mod.request({
      hostname: parsed.hostname,
      port:     parsed.port || (isHttps ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   options.method || "GET",
      headers:  options.headers || {},
      timeout:  20000,
      rejectUnauthorized: false,
    }, resolve);
    req.on("error",   reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout ao conectar")); });
    if (options.body) req.write(options.body);
    req.end();
  });
}

// Descomprime a resposta (gzip / deflate / br)
function decompress(res) {
  return new Promise((resolve, reject) => {
    const enc = (res.headers["content-encoding"] || "").toLowerCase();
    const chunks = [];
    let stream = res;

    if (enc === "gzip" || enc === "x-gzip") {
      stream = res.pipe(zlib.createGunzip());
    } else if (enc === "deflate") {
      stream = res.pipe(zlib.createInflate());
    } else if (enc === "br") {
      stream = res.pipe(zlib.createBrotliDecompress());
    }

    stream.on("data", c => chunks.push(c));
    stream.on("end",  () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

function rewriteUrl(url, base, proxyBase) {
  try {
    if (!url || url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("javascript:") || url.startsWith("#") || url.startsWith("//") && !url.startsWith("///")) {
      if (url && url.startsWith("//")) return proxyBase + encodeURIComponent("https:" + url);
      return url;
    }
    const abs = new URL(url, base).href;
    if (!abs.startsWith("http")) return url;
    return proxyBase + encodeURIComponent(abs);
  } catch { return url; }
}

function rewriteHtml(html, base, proxyBase) {
  // Atributos href/src/action/data-src
  html = html.replace(/(href|src|action|data-src|data-href)=(["'])([^"']*)\2/gi, (_, attr, q, url) => {
    return `${attr}=${q}${rewriteUrl(url, base, proxyBase)}${q}`;
  });

  // srcset
  html = html.replace(/srcset=(["'])([^"']+)\1/gi, (_, q, srcset) => {
    const rw = srcset.replace(/(\S+)(\s+[\d.]+[wx])?/g, (m, url, desc) =>
      rewriteUrl(url.trim(), base, proxyBase) + (desc || ""));
    return `srcset=${q}${rw}${q}`;
  });

  // <script src=...> inline rewrite já coberto acima
  // meta refresh
  html = html.replace(/(content=["']\d+;\s*url=)([^"']+)(["'])/gi, (_, pre, url, post) =>
    pre + rewriteUrl(url, base, proxyBase) + post);

  // Inline style url()
  html = html.replace(/style=(["'])([^"']*)\1/gi, (_, q, style) => {
    const rw = style.replace(/url\(["']?([^"')]+)["']?\)/gi, (m, u) =>
      `url("${rewriteUrl(u, base, proxyBase)}")`);
    return `style=${q}${rw}${q}`;
  });

  // Injeta script de reescrita dinâmica + barra
  const inject = `
<style>
#__cu_bar{position:fixed;top:0;left:0;right:0;z-index:2147483647;display:flex;align-items:center;gap:8px;padding:7px 12px;background:rgba(13,15,26,0.95);backdrop-filter:blur(14px);border-bottom:1px solid #252839;font-family:sans-serif;box-shadow:0 2px 20px rgba(0,0,0,.5)}
#__cu_bar a{color:#007bff;font-weight:700;font-size:13px;text-decoration:none;white-space:nowrap;flex-shrink:0}
#__cu_inp{flex:1;background:#1c1f2e;border:1.5px solid #252839;border-radius:8px;padding:6px 11px;color:#e8eaf6;font-size:13px;outline:none;min-width:0}
#__cu_inp:focus{border-color:#007bff}
#__cu_go{background:#007bff;color:#fff;border:none;border-radius:8px;padding:6px 14px;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;flex-shrink:0}
#__cu_go:hover{background:#3395ff}
</style>
<script>
(function(){
  var PROXY="${proxyBase}";
  var BASE="${base}";
  function toProxy(u){
    try{
      if(!u||u.startsWith("data:")||u.startsWith("blob:")||u.startsWith("javascript:")||u.startsWith("#"))return u;
      if(u.startsWith("//"))u="https:"+u;
      var abs=new URL(u,BASE).href;
      if(!abs.startsWith("http"))return u;
      return PROXY+encodeURIComponent(abs);
    }catch(e){return u;}
  }
  document.addEventListener("click",function(e){
    var a=e.target.closest("a[href]");
    if(!a)return;
    var h=a.getAttribute("href");
    if(!h||h.startsWith("#")||h.startsWith("javascript:"))return;
    e.preventDefault();
    window.location.href=toProxy(h);
  },true);
  document.addEventListener("submit",function(e){
    var f=e.target;if(!f)return;
    e.preventDefault();
    var action=f.action||BASE;
    var params=new URLSearchParams(new FormData(f)).toString();
    if((f.method||"get").toLowerCase()==="post"){
      window.location.href=PROXY+encodeURIComponent(action);
    }else{
      window.location.href=toProxy(action+(action.includes("?")?"&":"?")+params);
    }
  },true);
  // Barra de navegação
  var bar=document.createElement("div");
  bar.id="__cu_bar";
  var curUrl=decodeURIComponent(location.search.replace("?url=",""))||BASE;
  bar.innerHTML='<a href="/">← Home</a>'
    +'<input id="__cu_inp" value="'+curUrl.replace(/"/g,"&quot;")+'" placeholder="URL ou busca..." />'
    +'<button id="__cu_go">Ir</button>';
  document.body.insertBefore(bar,document.body.firstChild);
  document.body.style.paddingTop="42px";
  document.getElementById("__cu_go").onclick=function(){
    var v=document.getElementById("__cu_inp").value.trim();
    if(!v)return;
    if(!/^https?:\/\//i.test(v)){
      v=/^[\w-]+\.[\w.]{2,}/.test(v)?"https://"+v:"https://www.google.com/search?q="+encodeURIComponent(v);
    }
    window.location.href=PROXY+encodeURIComponent(v);
  };
  document.getElementById("__cu_inp").addEventListener("keydown",function(e){
    if(e.key==="Enter")document.getElementById("__cu_go").click();
  });
})();
<\/script>`;

  if (/<\/body>/i.test(html)) {
    html = html.replace(/<\/body>/i, inject + "</body>");
  } else {
    html += inject;
  }
  return html;
}

function filterResHeaders(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    if (!BLOCKED_RES_HEADERS.has(k.toLowerCase())) out[k] = v;
  }
  return out;
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }

  const rawUrl = req.query && req.query.url;
  if (!rawUrl) {
    res.statusCode = 302;
    res.setHeader("Location", "/");
    return res.end();
  }

  let targetUrl;
  try {
    targetUrl = decodeURIComponent(rawUrl);
    new URL(targetUrl);
  } catch {
    res.statusCode = 400;
    return res.end("URL inválida.");
  }

  const proto = req.headers["x-forwarded-proto"] || "https";
  const proxyBase = `${proto}://${req.headers.host}/api/proxy?url=`;

  const reqHeaders = {
    host: new URL(targetUrl).host,
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
    "accept-encoding": "gzip, deflate, br",
    "upgrade-insecure-requests": "1",
  };

  let body;
  if (!["GET","HEAD"].includes(req.method)) {
    const chunks = [];
    await new Promise(r => { req.on("data", c => chunks.push(c)); req.on("end", r); });
    body = Buffer.concat(chunks);
  }

  try {
    let upstream = await doFetch(targetUrl, { method: req.method, headers: reqHeaders, body });

    // Segue redirects (máx 5)
    let redirects = 0;
    while ([301,302,303,307,308].includes(upstream.statusCode) && redirects++ < 5) {
      const loc = upstream.headers.location;
      if (!loc) break;
      const newUrl = new URL(loc, targetUrl).href;
      targetUrl = newUrl;
      reqHeaders.host = new URL(newUrl).host;
      upstream = await doFetch(newUrl, { method: "GET", headers: reqHeaders });
    }

    const ct = (upstream.headers["content-type"] || "").toLowerCase();
    const filtered = filterResHeaders(upstream.headers);

    if (ct.includes("text/html")) {
      const buf = await decompress(upstream);
      let html = buf.toString("utf-8");
      html = rewriteHtml(html, targetUrl, proxyBase);
      res.statusCode = upstream.statusCode;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.end(html);
    }

    if (ct.includes("text/css")) {
      const buf = await decompress(upstream);
      let css = buf.toString("utf-8");
      css = css.replace(/url\(["']?([^"')]+)["']?\)/gi, (_, u) =>
        `url("${rewriteUrl(u.trim(), targetUrl, proxyBase)}")`);
      res.statusCode = upstream.statusCode;
      res.setHeader("Content-Type", "text/css");
      return res.end(css);
    }

    // Tudo mais: passa direto com headers filtrados
    res.statusCode = upstream.statusCode;
    for (const [k, v] of Object.entries(filtered)) {
      try { res.setHeader(k, v); } catch {}
    }
    upstream.pipe(res);

  } catch (err) {
    res.statusCode = 502;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Erro — Class Unblocker</title>
<style>body{font-family:sans-serif;background:#0d0f1a;color:#e8eaf6;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.b{text-align:center;padding:40px}.b h2{color:#ff4d6d;margin-bottom:12px}.b p{color:#5a6482;margin-bottom:24px}a{color:#007bff;text-decoration:none}</style>
</head><body><div class="b"><h2>Não foi possível acessar</h2><p>${err.message}</p><p><small>${targetUrl}</small></p><a href="/">← Voltar</a></div></body></html>`);
  }
};
