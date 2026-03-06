/**
 * uv.sw.js — Ultraviolet Service Worker entry point
 * Intercepta e redireciona todas as requisições através do proxy UV.
 */

importScripts("/uv/uv.bundle.js");
importScripts("/uv/uv.config.js");
importScripts("/uv/uv.handler.js");

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
