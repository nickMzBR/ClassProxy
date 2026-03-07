// uv.sw.js — Class Unblocker Service Worker

try {
  importScripts("https://cdn.jsdelivr.net/npm/@titaniumnetwork-dev/ultraviolet@2/dist/uv.bundle.js");
} catch(e) {
  console.error("[UV] Falha ao carregar bundle:", e);
}

importScripts("/uv/uv.config.js");

const sw = new UVServiceWorker();

self.addEventListener("fetch", (event) => {
  event.respondWith(
    (async () => {
      if (sw.route(event)) {
        return await sw.fetch(event);
      }
      return fetch(event.request);
    })()
  );
});
