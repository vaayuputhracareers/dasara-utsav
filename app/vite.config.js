import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// '/sb' is only used for local testing (proxies to the local Supabase copy).
const devProxy = { '/sb': { target: 'http://127.0.0.1:54321', changeOrigin: true, rewrite: (p) => p.replace(/^\/sb/, '') } };

// Where the website lives:
//   "/"        → Netlify, Vercel, a custom domain, or https://<user>.github.io
//   "/<repo>/" → a GitHub Pages project site, e.g. https://<user>.github.io/dasara-utsav/
// The GitHub workflow sets BASE_PATH automatically, so normally nobody edits this.
const base = ('/' + (process.env.BASE_PATH || '/').trim() + '/').replace(/\/{2,}/g, '/');

// A fresh number on every build. It is added to config.js (?v=…) so phones load the
// new Supabase settings right away instead of an old cached copy.
const buildId = Date.now().toString(36);
const buildTime = new Date().toISOString();   // App version (☰ More); also in index.html as <meta name="app-build">

const deployHelpers = {
  name: 'utsav-deploy-helpers',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler: (html) => html.replace(/(<script\s+src="[^"?]*config\.js)"/, `$1?v=${buildId}"`)
      .replace('</head>', `  <meta name="app-build" content="${buildTime}" />\n  </head>`),
  },
  // GitHub Pages cannot "rewrite every path to index.html". It does serve 404.html for
  // unknown paths, so a copy of index.html there makes links such as /r/<token>
  // (donor receipt) and /p/<slug> (public QR page) open correctly.
  writeBundle(opts) {
    const dir = opts.dir;
    if (dir && existsSync(join(dir, 'index.html'))) copyFileSync(join(dir, 'index.html'), join(dir, '404.html'));
  },
};

export default defineConfig({
  base,
  define: { __BUILD_TIME__: JSON.stringify(buildTime) },   // shown in ☰ More (app version)
  plugins: [react(), deployHelpers],
  // fs.allow '..': the admin's "Copy SQL" button bundles ../supabase/setup.sql (loaded on demand)
  server: { host: '0.0.0.0', port: 5173, allowedHosts: true, proxy: devProxy, fs: { allow: ['..'] } },
  preview: { host: '0.0.0.0', port: 5173, allowedHosts: true, proxy: devProxy },
  build: { chunkSizeWarningLimit: 1500, sourcemap: false },
});
