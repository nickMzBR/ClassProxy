/**
 * Class Unblocker — Ultraviolet Configuration
 * Docs: https://github.com/titaniumnetwork-dev/Ultraviolet
 */
self.__uv$config = {
  /** Prefix used for all proxied requests. Must match the Vercel rewrite. */
  prefix: '/service/',

  /** Bare server endpoint(s). Add your own bare server URLs here. */
  bare: '/bare/',

  /** Encode the destination URL before sending to the service worker. */
  encodeUrl: Ultraviolet.codec.xor.encode,

  /** Matching decode function. */
  decodeUrl: Ultraviolet.codec.xor.decode,

  /** Path to the UV service worker script. */
  handler: '/uv/uv.handler.js',

  /** Path to the UV bundle. */
  bundle:  '/uv/uv.bundle.js',

  /** Path to this config file (referenced by the service worker). */
  config:  '/uv/uv.config.js',

  /** Path to the SW injector used by the service worker. */
  sw:      '/uv/uv.sw.js',
};