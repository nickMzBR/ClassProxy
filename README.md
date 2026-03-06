# Class Unblocker

A clean, minimal proxy frontend powered by [Ultraviolet (UV)](https://github.com/titaniumnetwork-dev/Ultraviolet), designed for one-click Vercel deployment.

---

## Project Structure

```
class-unblocker/
├── public/
│   ├── index.html          ← Main UI
│   └── uv/
│       ├── uv.config.js    ← UV configuration (edit prefix & bare here)
│       ├── uv.bundle.js    ← (copy from UV package)
│       ├── uv.handler.js   ← (copy from UV package)
│       └── uv.sw.js        ← (copy from UV package)
└── vercel.json             ← Vercel deployment + rewrite rules
```

---

## Setup

### 1. Install UV assets

```bash
npm install @titaniumnetwork-dev/ultraviolet
cp node_modules/@titaniumnetwork-dev/ultraviolet/dist/* public/uv/
```

### 2. Configure a Bare Server

Edit `vercel.json` and replace the bare destination:

```json
{
  "source": "/bare/:path*",
  "destination": "https://YOUR-BARE-SERVER.example.com/:path*"
}
```

Popular free bare servers: [bare-server-node](https://github.com/tomphttp/bare-server-node)

You can deploy your own bare server to Railway, Render, or Fly.io.

### 3. Update `uv.config.js` (optional)

Change the codec if needed (`xor` ↔ `base64`):

```js
encodeUrl: Ultraviolet.codec.base64.encode,
decodeUrl: Ultraviolet.codec.base64.decode,
```

### 4. Deploy to Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

Or connect your GitHub repo in the [Vercel Dashboard](https://vercel.com/dashboard) for automatic deployments.

---

## How It Works

1. User enters a URL or search term in the search bar.
2. The frontend encodes the URL using the UV codec and routes it to `/service/`.
3. The UV Service Worker intercepts requests under `/service/` and proxies them through the bare server.
4. Responses are decoded and rendered — the origin site cannot detect the proxy.

---

## Customisation

| What                  | Where                                |
|-----------------------|--------------------------------------|
| Accent colour         | `--accent` in `index.html` `:root`   |
| Quick-access chips    | `shortcuts` array in `index.html`    |
| Proxy prefix path     | `prefix` in `uv.config.js`           |
| Bare server URL       | `bare` in `uv.config.js` + `vercel.json` rewrite |

---

## License

MIT