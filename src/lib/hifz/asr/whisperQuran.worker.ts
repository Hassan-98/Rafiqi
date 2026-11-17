/// <reference lib="webworker" />
/**
 * Quran-tuned Whisper ASR worker — the DESKTOP recitation engine.
 *
 * Chromium inside Electron has no speech backend (the Web Speech API exists
 * but every `start()` dies with a network error), so the desktop build runs
 * recognition fully on-device: Tarteel's `whisper-base-ar-quran` fine-tune
 * (≈5.75% WER on recitation) exported to ONNX, executed by transformers.js
 * on WebGPU when available, WASM otherwise.
 *
 * The model (~45 MB quantized) downloads from the HuggingFace CDN on first
 * use and is cached by the browser Cache API afterwards (works offline from
 * then on). The service keeps this worker alive between sessions so the
 * pipeline loads once per app run.
 */

type InMsg = { type: 'init' } | { type: 'transcribe'; id: number; audio: Float32Array };

type Transcriber = (
  audio: Float32Array,
  opts: Record<string, unknown>,
) => Promise<{ text: string } | Array<{ text: string }>>;

const MODEL_ID = 'aaqibhabib/whisper-base-ar-quran-onnx';

let loadPromise: Promise<Transcriber> | null = null;
/** Serialize transcriptions — whisper inference is not reentrant-safe here. */
let chain: Promise<unknown> = Promise.resolve();

/**
 * Backend ladder: WebGPU fp32, then WASM q8 (works everywhere; ~45 MB).
 * IMPORTANT: a backend that loads can still fail at INFERENCE time, so each
 * candidate is smoke-tested with half a second of silence before being
 * accepted.
 *
 * Do NOT add fp16 or q4 rungs for this repo: q4 doesn't exist (404), and the
 * fp16 decoder export has a broken ONNX graph (float16/float type-inference
 * error) which then POISONS every later pipeline construction for the same
 * model id in this worker — once fp16 fails, fp32 and q8 fail with the same
 * error until the worker restarts. Verified 2026-06-12.
 */
const BACKENDS = [
  { device: 'webgpu', dtype: 'fp32' },
  { device: 'wasm', dtype: 'q8' },
] as const;

/** Drop the broken fp16 files any earlier app version left in the cache. */
async function purgeBrokenFp16(): Promise<void> {
  try {
    const cache = await caches.open('transformers-cache');
    for (const req of await cache.keys()) {
      if (req.url.includes('_fp16')) await cache.delete(req);
    }
  } catch {
    /* best-effort */
  }
}

async function createPipeline(): Promise<Transcriber> {
  const { pipeline } = await import('@huggingface/transformers');
  const progress_callback = (p: { status?: string; file?: string; progress?: number }) => {
    if (p.status === 'progress' && p.file && typeof p.progress === 'number') {
      self.postMessage({ type: 'progress', file: p.file, progress: p.progress });
    }
  };
  let lastError: unknown = null;
  for (const backend of BACKENDS) {
    try {
      const t = (await pipeline('automatic-speech-recognition', MODEL_ID, {
        device: backend.device,
        dtype: backend.dtype as never,
        progress_callback,
      })) as unknown as Transcriber;
      // Inference smoke test — 0.5s of silence must transcribe without
      // throwing. NEVER pass `language`/`task`: this fine-tune's exported
      // config lacks the multilingual metadata, so transformers.js treats it
      // as English-only and rejects those options. The model transcribes
      // Quranic Arabic unconditionally — the options are unnecessary.
      await t(new Float32Array(8000), {});
      console.info('[whisperWorker] using backend', backend.device, backend.dtype);
      return t;
    } catch (e) {
      lastError = e;
      console.warn('[whisperWorker] backend failed', backend.device, e);
    }
  }
  throw lastError ?? new Error('no usable ASR backend');
}

function ensureLoaded(): Promise<Transcriber> {
  if (!loadPromise) {
    loadPromise = purgeBrokenFp16()
      .then(createPipeline)
      .then((t) => {
        self.postMessage({ type: 'ready' });
        return t;
      })
      .catch((e) => {
        loadPromise = null;
        // "model unavailable" routes to the session's FATAL handler.
        self.postMessage({ type: 'init-error', message: `model unavailable: ${String(e)}` });
        throw e;
      });
  }
  return loadPromise;
}

self.onmessage = (e: MessageEvent<InMsg>) => {
  const msg = e.data;
  if (msg.type === 'init') {
    void ensureLoaded().catch(() => undefined);
    return;
  }
  if (msg.type === 'transcribe') {
    chain = chain
      .then(async () => {
        try {
          const transcriber = await ensureLoaded();
          // Segments are ≤8s — a single whisper window, no chunking or
          // language/task options needed (see smoke-test note above).
          const out = await transcriber(msg.audio, {});
          const text = (Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text) ?? '';
          self.postMessage({ type: 'result', id: msg.id, text: text.trim() });
        } catch (err) {
          self.postMessage({ type: 'error', id: msg.id, message: String(err) });
        }
      })
      .catch(() => undefined);
  }
};
