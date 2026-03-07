// uv.sw.js — Class Unblocker
// SW minimalista que funciona sem depender do bundle UV externo

self.addEventListener("install", (e) => {
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(clients.claim());
});

// Decodifica XOR (igual ao encode — XOR é simétrico)
function xorDecode(encoded) {
  try {
    const decoded = decodeURIComponent(encoded);
    return decoded.split("").map(c => String.fromCharCode(c.charCodeAt(0) ^ 2)).join("");
  } catch(e) {
    return null;
  }
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Só intercepta /service/...
  if (!url.pathname.startsWith("/service/")) return;

  const encodedTarget = url.pathname.slice("/service/".length) + url.search;
  const targetUrl = xorDecode(encodedTarget);

  if (!targetUrl || !targetUrl.startsWith("http")) return;

  event.respondWith(proxyFetch(event.request, targetUrl));
});

async function proxyFetch(originalRequest, targetUrl) {
  try {
    const headers = new Headers();

    // Repassa headers relevantes
    for (const [key, value] of originalRequest.headers.entries()) {
      const lower = key.toLowerCase();
      if (!["host", "origin", "referer", "cookie"].includes(lower)) {
        headers.set(key, value);
      }
    }

    headers.set("host", new URL(targetUrl).host);

    const response = await fetch(targetUrl, {
      method: originalRequest.method,
      headers,
      body: ["GET", "HEAD"].includes(originalRequest.method) ? null : await originalRequest.arrayBuffer(),
      redirect: "follow",
      credentials: "omit",
    });

    const contentType = response.headers.get("content-type") || "";
    
    // Para HTML, reescreve links para passar pelo proxy
    if (contentType.includes("text/html")) {
      let html = await response.text();
      const base = new URL(targetUrl);

      // Reescreve src= href= action= para passar pelo proxy
      html = rewriteHtml(html, base);

      return new Response(html, {
        status: response.status,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "x-proxied-by": "class-unblocker",
        },
      });
    }

    // Para outros tipos, passa direto
    return new Response(response.body, {
      status: response.status,
      headers: filterResponseHeaders(response.headers),
    });

  } catch(err) {
    return new Response(`
      <!DOCTYPE html>
      <html>
      <head><meta charset="UTF-8"><title>Erro — Class Unblocker</title>
      <style>
        body { font-family: sans-serif; background: #0d0f1a; color: #e8eaf6;
          display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .box { text-align: center; max-width: 500px; padding: 40px; }
        h2 { color: #ff4d6d; margin-bottom: 12px; }
        p { color: #5a6482; margin-bottom: 24px; }
        a { color: #007bff; text-decoration: none; }
        code { background: #1c1f2e; padding: 4px 8px; border-radius: 4px; font-size: 12px; color: #ff4d6d; }
      </style>
      </head>
      <body>
      <div class="box">
        <h2>Não foi possível acessar o site</h2>
        <p>${err.message}</p>
        <p>URL: <code>${targetUrl}</code></p>
        <a href="/">← Voltar</a>
      </div>
      </body>
      </html>
    `, {
      status: 502,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
}

function rewriteHtml(html, base) {
  // Injeta script de reescrita de links na página
  const script = `
<script>
(function() {
  const BASE = "${base.origin}";
  const SW_PREFIX = "/service/";

  function xorEncode(str) {
    return encodeURIComponent(
      str.split("").map(c => String.fromCharCode(c.charCodeAt(0) ^ 2)).join("")
    );
  }

  function toProxy(url) {
    try {
      const abs = new URL(url, BASE).href;
      if (!abs.startsWith("http")) return url;
      return SW_PREFIX + xorEncode(abs);
    } catch(e) { return url; }
  }

  // Intercepta clicks em links
  document.addEventListener("click", function(e) {
    const a = e.target.closest("a");
    if (!a || !a.href) return;
    const href = a.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("javascript")) return;
    e.preventDefault();
    window.location.href = toProxy(new URL(href, BASE).href);
  }, true);

  // Intercepta forms
  document.addEventListener("submit", function(e) {
    const form = e.target;
    if (!form.action) return;
    e.preventDefault();
    const data = new FormData(form);
    const params = new URLSearchParams(data).toString();
    const action = new URL(form.action, BASE).href;
    if (form.method && form.method.toLowerCase() === "post") {
      fetch(SW_PREFIX + xorEncode(action), { method: "POST", body: data })
        .then(r => r.text()).then(html => {
          document.open(); document.write(html); document.close();
        });
    } else {
      window.location.href = SW_PREFIX + xorEncode(action + "?" + params);
    }
  }, true);
})();
<\/script>`;

  // Adiciona base tag e script antes do </body>
  if (html.includes("</body>")) {
    html = html.replace("</body>", script + "</body>");
  } else {
    html += script;
  }

  return html;
}

function filterResponseHeaders(headers) {
  const result = {};
  const blocked = ["content-security-policy", "x-frame-options",
    "strict-transport-security", "content-encoding"];
  for (const [key, value] of headers.entries()) {
    if (!blocked.includes(key.toLowerCase())) {
      result[key] = value;
    }
  }
  return result;
}
