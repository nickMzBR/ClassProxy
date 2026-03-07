// api/proxy.js — Class Unblocker core proxy
// Recebe ?url=https://... e retorna o conteúdo reescrito

const https = require("https");
const http  = require("http");
const { URL } = require("url");

// Headers que não devem ser repassados
const BLOCKED_REQ_HEADERS  = new Set(["host","origin","referer","cookie","cf-ray","cf-connecting-ip","x-forwarded-for","x-vercel-id"]);
const BLOCKED_RES_HEADERS  = new Set(["content-security-policy","x-frame-options","strict-transport-security","content-encoding","transfer-encoding","connection","keep-alive"]);

function fetch(targetUrl, options = {}) {
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
      timeout:  15000,
      rejectUnauthorized: false,
    }, resolve);

    req.on("error",   reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });

    if (options.body) req.write(options.body);
    req.end();
  });
}

function rewriteUrl(url, base, proxyBase) {
  try {
    if (!url || url.startsWith("data:") || url.startsWith("blob:") || url.startsWith("javascript:") || url.startsWith("#")) return url;
    const abs = new URL(url, base).href;
    return proxyBase + encodeURIComponent(abs);
  } catch { return url; }
}

function rewriteHtml(html, base, proxyBase) {
  // Reescreve atributos href, src, action
  html = html.replace(/(href|src|action)=["']([^"']+)["']/gi, (match, attr, url) => {
    return `${attr}="${rewriteUrl(url, base, proxyBase)}"`;
  });

  // Reescreve srcset
  html = html.replace(/srcset=["']([^"']+)["']/gi, (_, srcset) => {
    const rewritten = srcset.replace(/(\S+)(\s+[\d.]+[wx])?/g, (m, url, desc) => {
      return rewriteUrl(url, base, proxyBase) + (desc || "");
    });
    return `srcset="${rewritten}"`;
  });

  // Reescreve meta refresh
  html = html.replace(/(content=["']\d+;\s*url=)([^"']+)(["'])/gi, (_, pre, url, post) => {
    return pre + rewriteUrl(url, base, proxyBase) + post;
  });

  // Injeta script de reescrita dinâmica + barra de navegação
  const inject = `
<script>
(function(){
  var PROXY = "${proxyBase}";
  var BASE  = "${base}";

  function toProxy(u) {
    try {
      if (!u || u.startsWith("data:") || u.startsWith("blob:") || u.startsWith("javascript:") || u.startsWith("#")) return u;
      return PROXY + encodeURIComponent(new URL(u, BASE).href);
    } catch(e){ return u; }
  }

  // Intercepta navegação por links
  document.addEventListener("click", function(e){
    var a = e.target.closest("a[href]");
    if (!a) return;
    var href = a.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
    e.preventDefault();
    window.location.href = toProxy(href);
  }, true);

  // Intercepta forms
  document.addEventListener("submit", function(e){
    var f = e.target;
    if (!f) return;
    e.preventDefault();
    var action = toProxy(f.action || BASE);
    if ((f.method||"get").toLowerCase() === "post") {
      var fd = new URLSearchParams(new FormData(f)).toString();
      window.location.href = PROXY + encodeURIComponent(action + (action.includes("?")?"&":"?") + fd);
    } else {
      var params = new URLSearchParams(new FormData(f)).toString();
      window.location.href = toProxy(action + (action.includes("?")?"&":"?") + params);
    }
  }, true);

  // Reescreve history.pushState / replaceState
  var _push = history.pushState.bind(history);
  var _rep  = history.replaceState.bind(history);
  history.pushState = function(s,t,u){ _push(s,t, u ? toProxy(u) : u); };
  history.replaceState = function(s,t,u){ _rep(s,t, u ? toProxy(u) : u); };

  // Barra de navegação flutuante
  var bar = document.createElement("div");
  bar.id  = "__cu_bar";
  bar.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:2147483647;display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(13,15,26,0.92);backdrop-filter:blur(12px);border-bottom:1px solid #252839;font-family:sans-serif;";
  bar.innerHTML = '<a href="/" style="color:#007bff;font-weight:700;font-size:13px;text-decoration:none;white-space:nowrap;">← Class Unblocker</a>'
    + '<input id="__cu_inp" value="' + decodeURIComponent(new URLSearchParams(window.location.search).get("url") || BASE) + '" style="flex:1;background:#1c1f2e;border:1px solid #252839;border-radius:8px;padding:6px 10px;color:#e8eaf6;font-size:13px;outline:none;" />'
    + '<button onclick="(function(){var v=document.getElementById(\'__cu_inp\').value.trim();if(!v)return;if(!/^https?:\\/\\//i.test(v))v=\'https://\'+v;window.location.href=PROXY+encodeURIComponent(v);})()" style="background:#007bff;color:#fff;border:none;border-radius:8px;padding:6px 14px;font-size:13px;font-weight:600;cursor:pointer;">Ir</button>';
  document.body.prepend(bar);
  document.body.style.paddingTop = "42px";
})();
<\/script>`;

  if (html.includes("</body>")) {
    html = html.replace(/<\/body>/i, inject + "</body>");
  } else {
    html += inject;
  }

  return html;
}

module.exports = async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }

  const rawUrl = req.query && req.query.url;
  if (!rawUrl) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "text/html");
    return res.end(`<p>Parâmetro <code>?url=</code> não informado.</p>`);
  }

  let targetUrl;
  try {
    targetUrl = decodeURIComponent(rawUrl);
    new URL(targetUrl); // valida
  } catch {
    res.statusCode = 400;
    return res.end("URL inválida.");
  }

  const proxyBase = `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}/api/proxy?url=`;

  // Monta headers para o request upstream
  const reqHeaders = { host: new URL(targetUrl).host, "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122 Safari/537.36", "accept": "text/html,application/xhtml+xml,*/*", "accept-language": "pt-BR,pt;q=0.9,en;q=0.8" };
  for (const [k, v] of Object.entries(req.headers)) {
    if (!BLOCKED_REQ_HEADERS.has(k.toLowerCase())) reqHeaders[k] = v;
  }

  let body;
  if (!["GET","HEAD"].includes(req.method)) {
    const chunks = [];
    await new Promise(r => { req.on("data", c => chunks.push(c)); req.on("end", r); });
    body = Buffer.concat(chunks);
  }

  try {
    const upstream = await fetch(targetUrl, { method: req.method, headers: reqHeaders, body });

    // Segue redirects manualmente
    if ([301,302,303,307,308].includes(upstream.statusCode)) {
      const loc = upstream.headers.location;
      if (loc) {
        const newUrl = new URL(loc, targetUrl).href;
        res.setHeader("Location", proxyBase + encodeURIComponent(newUrl));
        res.statusCode = upstream.statusCode;
        return res.end();
      }
    }

    // Repassa headers permitidos
    for (const [k, v] of Object.entries(upstream.headers)) {
      if (!BLOCKED_RES_HEADERS.has(k.toLowerCase())) {
        try { res.setHeader(k, v); } catch {}
      }
    }

    const ct = upstream.headers["content-type"] || "";

    if (ct.includes("text/html")) {
      const chunks = [];
      await new Promise(r => { upstream.on("data", c => chunks.push(c)); upstream.on("end", r); });
      let html = Buffer.concat(chunks).toString("utf-8");
      html = rewriteHtml(html, targetUrl, proxyBase);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.statusCode = upstream.statusCode;
      return res.end(html);
    }

    // CSS — reescreve urls
    if (ct.includes("text/css")) {
      const chunks = [];
      await new Promise(r => { upstream.on("data", c => chunks.push(c)); upstream.on("end", r); });
      let css = Buffer.concat(chunks).toString("utf-8");
      css = css.replace(/url\(["']?([^"')]+)["']?\)/gi, (_, u) => `url("${rewriteUrl(u, targetUrl, proxyBase)}")`);
      res.setHeader("Content-Type", "text/css");
      res.statusCode = upstream.statusCode;
      return res.end(css);
    }

    // Tudo mais passa direto
    res.statusCode = upstream.statusCode;
    upstream.pipe(res);

  } catch (err) {
    res.statusCode = 502;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Erro</title>
    <style>body{font-family:sans-serif;background:#0d0f1a;color:#e8eaf6;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
    .b{text-align:center;padding:40px}.b h2{color:#ff4d6d;margin-bottom:12px}.b p{color:#5a6482;margin-bottom:24px}a{color:#007bff}</style>
    </head><body><div class="b"><h2>Não foi possível acessar</h2><p>${err.message}</p><a href="/">← Voltar</a></div></body></html>`);
  }
};
