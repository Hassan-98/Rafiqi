import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { readFileSync } from 'fs';

/**
 * Dev server only: POST /__fetch-text {url, init} → that https page's text, so
 * the lesson-link reader (src/services/lessonLink.ts) works in a plain browser
 * during development like it does on Android (CapacitorHttp) and desktop
 * (desktopShell.fetchText). Never part of a build.
 */
const devFetchText = (): Plugin => ({
  name: 'dev-fetch-text',
  apply: 'serve',
  configureServer(server) {
    server.middlewares.use('/__fetch-text', async (req, res) => {
      let body = '';
      for await (const chunk of req) body += chunk;
      try {
        const { url, init = {} } = JSON.parse(body) as { url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } };
        if (req.method !== 'POST' || !/^https:\/\//.test(url)) throw new Error('POST an https url');
        const r = await fetch(url, { method: init.method || 'GET', headers: init.headers, body: init.body, signal: AbortSignal.timeout(12_000) });
        res.statusCode = r.ok ? 200 : 502;
        res.end(await r.text());
      } catch (e) {
        res.statusCode = 400;
        res.end(String(e));
      }
    });
  },
});

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    devFetchText(),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync('package.json', 'utf8')).version),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  worker: {
    // The Quran-ASR inference worker (src/lib/hifz/asr/quranAsr.worker.ts)
    // imports npm modules (onnxruntime-web, transformers.js), which requires
    // ESM worker output — the default iife can't code-split.
    format: 'es',
  },
});
