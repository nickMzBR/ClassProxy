// uv.sw.js — Service Worker do Ultraviolet
// Importa o bundle via CDN jsDelivr (sempre disponível)
importScripts("https://cdn.jsdelivr.net/npm/@titaniumnetwork-dev/ultraviolet@2/dist/uv.bundle.js");
importScripts("/uv/uv.config.js");

const sw = new UVServiceWorker();

self.addEventListener("fetch", (event) => {
  event.respondWith(
    (async () => {
      if (sw.route(event)) {
        return await sw.fetch(event);
      }
      return await fetch(event.request);
    })()
  );
});
