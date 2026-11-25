import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? listFiles(p) : [p];
  });
}

// In production builds, lock the app down with a Content-Security-Policy that
// forbids any network connection. Patient data can never leave the device.
const csp: Plugin = {
  name: 'offline-csp',
  apply: 'build',
  transformIndexHtml(html) {
    const policy = [
      "default-src 'self'",
      // 'wasm-unsafe-eval' lets the on-device PDF/OCR engines run WebAssembly; it does not allow JS eval.
      "script-src 'self' 'wasm-unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' blob: data:",
      "frame-src blob:",
      "object-src blob:",
      "worker-src 'self'",
      "manifest-src 'self'",
      // Only the app's own (static) files can be fetched – e.g. the OCR engine. No other server is reachable.
      "connect-src 'self'",
      "form-action 'none'",
      "base-uri 'none'",
    ].join('; ');
    return html.replace(
      '<meta charset="UTF-8" />',
      `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
    );
  },
};

// Generates sw.js with the exact list of built files, so the installed app
// works fully offline. The service worker only ever serves files from this
// app's own cache/origin – it never contacts any other server.
const serviceWorker: Plugin = {
  name: 'offline-service-worker',
  apply: 'build',
  generateBundle(_opts, bundle) {
    const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
    const pdfjsFiles = listFiles(join(process.cwd(), 'public', 'vendor', 'pdfjs')).map((f) => relative(join(process.cwd(), 'public'), f).split('\\').join('/'));
    const statics = ['manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', ...pdfjsFiles];
    const all = ['./', ...files, ...statics];
    const version = createHash('sha256').update(all.join('|') + JSON.stringify(Object.values(bundle).map((b) => ('code' in b ? b.code.length : 0)))).digest('hex').slice(0, 12);
    const src = `// Generated at build time.
const CACHE = 'pain-chronicle-${version}';
const OCR_CACHE = 'pain-chronicle-ocr-v1';
const FILES = ${JSON.stringify(all)};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('pain-chronicle-') && k !== CACHE && k !== OCR_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never touch other origins
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('./', { cacheName: CACHE, ignoreVary: true }).then((r) => r || fetch(req)));
    return;
  }
  // The OCR engine (~15 MB) is not pre-cached; it is cached the first time it is used, then works offline.
  if (url.pathname.includes('/vendor/tesseract/')) {
    e.respondWith(
      caches.open(OCR_CACHE).then((c) =>
        c.match(req, { ignoreVary: true }).then((hit) => hit || fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; })),
      ),
    );
    return;
  }
  e.respondWith(caches.match(req, { cacheName: CACHE, ignoreSearch: true, ignoreVary: true }).then((r) => r || fetch(req)));
});
`;
    this.emitFile({ type: 'asset', fileName: 'sw.js', source: src });
  },
};

export default defineConfig({
  base: './',
  plugins: [react(), csp, serviceWorker],
});
