import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { readFileSync } from 'fs';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
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
