import type { IRecitationRecognizer, RecitationListener } from './speechRecognition';
import { toast } from '@/store/toastStore';

/**
 * Desktop recitation recognizer — on-device Quran-tuned Whisper.
 *
 * The Web Speech API in Electron's Chromium has no speech service behind it
 * (every start() errors with `network`), so on desktop we capture the mic
 * ourselves and run Tarteel's whisper-base-ar-quran ONNX export in a worker
 * (see lib/hifz/asr/whisperQuran.worker.ts).
 *
 * Flow: getUserMedia → 16 kHz mono PCM → energy-based utterance segmenter
 * (700 ms of silence ends an utterance, 8 s hard cap) → worker transcribes →
 * the text is delivered as ONE FINAL transcript per utterance, the same shape
 * the Android plugin's finals take, so useHifzSession's aligner needs no
 * changes. Audio captured while the model is still downloading is buffered
 * and transcribed once it's ready — the first words of a session are never
 * lost.
 */

interface WorkerOut {
  type: 'ready' | 'progress' | 'result' | 'error' | 'init-error';
  id?: number;
  text?: string;
  message?: string;
  file?: string;
  progress?: number;
}

const TARGET_RATE = 16000;
/** Frame ≈128 ms at 16 kHz with a 2048-sample processor buffer. */
const PROCESSOR_BUFFER = 2048;
const SILENCE_END_MS = 700;
/** Hard cap per segment. Tajweed breaths run long — 12s still sits well
 *  inside whisper's 30s window while bounding latency. */
const MAX_UTTERANCE_MS = 12000;
const MIN_SPEECH_MS = 300;
const PRE_ROLL_CHUNKS = 3;
/** Audio carried into the next segment when the CAP (not silence) cuts a
 *  breath — without it the word straddling the cut is lost on both sides. */
const CAP_OVERLAP_CHUNKS = 4;
/** Don't queue more than this many segments while the model downloads. */
const MAX_PENDING_SEGMENTS = 8;

function rms(x: Float32Array): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i] * x[i];
  return Math.sqrt(s / Math.max(1, x.length));
}

/** Concatenate chunks and (if needed) linearly resample to 16 kHz. */
function toMono16k(chunks: Float32Array[], sourceRate: number): Float32Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const joined = new Float32Array(total);
  let off = 0;
  for (const c of chunks) {
    joined.set(c, off);
    off += c.length;
  }
  if (sourceRate === TARGET_RATE) return joined;
  const outLen = Math.floor((joined.length * TARGET_RATE) / sourceRate);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = (i * sourceRate) / TARGET_RATE;
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    const a = joined[i0] ?? 0;
    const b = joined[i0 + 1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

class WhisperRecitationRecognizer implements IRecitationRecognizer {
  private worker: Worker | null = null;
  private ready = false;
  private announcedDownload = false;
  private listener: RecitationListener | null = null;

  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private silentSink: GainNode | null = null;

  // Utterance segmentation state.
  private preRoll: Float32Array[] = [];
  private utterance: Float32Array[] = [];
  private speechActive = false;
  private silenceMs = 0;
  private utteranceMs = 0;
  private speechMs = 0;
  private noiseFloor = 0.004;

  private seq = 0;
  private pendingSegments: Float32Array[] = [];
  private inferenceFails = 0;
  private debugFrames = 0;

  // ── Worker lifecycle (kept warm across sessions) ──────────────────
  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('../lib/hifz/asr/whisperQuran.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (e: MessageEvent<WorkerOut>) => {
      const m = e.data;
      if (m.type === 'ready') {
        this.ready = true;
        if (this.announcedDownload) toast.success('محرك التسميع جاهز');
        // Flush whatever was recited while the model loaded.
        const queued = this.pendingSegments;
        this.pendingSegments = [];
        for (const seg of queued) this.post(seg);
        return;
      }
      if (m.type === 'progress') {
        if (!this.announcedDownload && (m.progress ?? 0) < 99) {
          this.announcedDownload = true;
          toast.info('جارٍ تنزيل نموذج التعرّف الصوتي (لمرة واحدة)…');
        }
        return;
      }
      if (m.type === 'result') {
        this.inferenceFails = 0;
        const text = (m.text ?? '').trim();
        console.info('[whisperASR] heard:', text || '(empty)');
        if (text) this.listener?.onTranscript(text, true);
        return;
      }
      if (m.type === 'init-error') {
        this.ready = false;
        this.listener?.onError(`asr-init: ${m.message ?? 'failed'}`);
        return;
      }
      if (m.type === 'error') {
        // One bad segment isn't fatal — but repeated failures mean the
        // backend is broken; surface it instead of "hearing nothing".
        console.warn('[whisperASR] segment failed', m.message);
        this.inferenceFails += 1;
        if (this.inferenceFails >= 3) {
          this.listener?.onError(`model unavailable: ${m.message ?? 'inference failed'}`);
        }
        return;
      }
    };
    worker.postMessage({ type: 'init' });
    this.worker = worker;
    return worker;
  }

  private post(audio: Float32Array): void {
    if (!this.worker || !this.ready) {
      this.pendingSegments.push(audio);
      if (this.pendingSegments.length > MAX_PENDING_SEGMENTS) this.pendingSegments.shift();
      return;
    }
    this.seq += 1;
    this.worker.postMessage({ type: 'transcribe', id: this.seq, audio }, [audio.buffer]);
  }

  // ── IRecitationRecognizer ─────────────────────────────────────────
  async isSupported(): Promise<boolean> {
    return (
      typeof WebAssembly !== 'undefined' &&
      typeof Worker !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia
    );
  }

  async requestPermission(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      return true;
    } catch {
      return false;
    }
  }

  async start(_language: string, listener: RecitationListener): Promise<void> {
    await this.stop();
    this.listener = listener;
    this.ensureWorker();

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e) {
      listener.onError(`not-allowed: ${String(e)}`);
      return;
    }

    // Ask for 16 kHz directly; Chromium resamples internally. If the device
    // forces another rate we resample at flush time (toMono16k).
    let ctx: AudioContext;
    try {
      ctx = new AudioContext({ sampleRate: TARGET_RATE });
    } catch {
      ctx = new AudioContext();
    }
    this.ctx = ctx;
    // A context created outside a direct user-gesture chain can start
    // suspended — without resume() the processor never receives audio
    // ("the app doesn't hear me").
    try {
      await ctx.resume();
    } catch {
      /* already running */
    }
    this.source = ctx.createMediaStreamSource(this.stream);
    this.processor = ctx.createScriptProcessor(PROCESSOR_BUFFER, 1, 1);
    // Chromium only pumps a ScriptProcessor that is wired to the destination;
    // a zero-gain sink keeps the graph silent (no feedback).
    this.silentSink = ctx.createGain();
    this.silentSink.gain.value = 0;

    this.resetSegmentation();
    const chunkMs = (PROCESSOR_BUFFER / ctx.sampleRate) * 1000;

    this.processor.onaudioprocess = (e) => {
      const input = e.inputBuffer.getChannelData(0);
      const chunk = new Float32Array(input.length);
      chunk.set(input);
      const level = rms(chunk);

      // Track the noise floor from every below-threshold frame (it must be
      // able to drift UP in a noisy room, not only down).
      const threshold = Math.max(0.006, this.noiseFloor * 3);
      if (level < threshold) {
        this.noiseFloor = this.noiseFloor * 0.95 + level * 0.05;
      }

      // Heartbeat for diagnosing "it doesn't hear me" reports: logs the live
      // mic level vs the trigger threshold every ~4s.
      this.debugFrames += 1;
      if (this.debugFrames % 32 === 0) {
        console.info(
          `[whisperASR] level=${level.toFixed(4)} threshold=${threshold.toFixed(4)} active=${this.speechActive}`,
        );
      }

      if (!this.speechActive) {
        this.preRoll.push(chunk);
        if (this.preRoll.length > PRE_ROLL_CHUNKS) this.preRoll.shift();
        if (level >= threshold) {
          this.speechActive = true;
          this.utterance = [...this.preRoll];
          this.preRoll = [];
          this.silenceMs = 0;
          this.utteranceMs = this.utterance.length * chunkMs;
          this.speechMs = chunkMs;
        }
        return;
      }

      this.utterance.push(chunk);
      this.utteranceMs += chunkMs;
      if (level >= threshold * 0.7) {
        this.silenceMs = 0;
        this.speechMs += chunkMs;
      } else {
        this.silenceMs += chunkMs;
      }

      if (this.silenceMs >= SILENCE_END_MS) {
        this.flushUtterance(ctx.sampleRate, false);
      } else if (this.utteranceMs >= MAX_UTTERANCE_MS) {
        this.flushUtterance(ctx.sampleRate, true);
      }
    };

    this.source.connect(this.processor);
    this.processor.connect(this.silentSink);
    this.silentSink.connect(ctx.destination);
  }

  private flushUtterance(sourceRate: number, capHit: boolean): void {
    const chunks = this.utterance;
    const hadSpeech = this.speechMs >= MIN_SPEECH_MS;
    const speechMs = this.speechMs;
    this.resetSegmentation();
    if (capHit) {
      // Mid-breath cut: seed the next segment with the tail so the word
      // straddling the boundary survives in the second transcription.
      this.preRoll = chunks.slice(-CAP_OVERLAP_CHUNKS);
    }
    if (!hadSpeech || chunks.length === 0) {
      console.info(`[whisperASR] segment dropped (speech ${Math.round(speechMs)}ms < ${MIN_SPEECH_MS}ms)`);
      return;
    }
    const audio = toMono16k(chunks, sourceRate);
    console.info(`[whisperASR] segment ${(audio.length / TARGET_RATE).toFixed(1)}s → asr (ready=${this.ready})`);
    this.post(audio);
  }

  private resetSegmentation(): void {
    this.utterance = [];
    this.preRoll = [];
    this.speechActive = false;
    this.silenceMs = 0;
    this.utteranceMs = 0;
    this.speechMs = 0;
  }

  async stop(): Promise<void> {
    // Transcribe whatever was mid-utterance, then tear the graph down.
    if (this.speechActive && this.ctx) this.flushUtterance(this.ctx.sampleRate, false);
    try {
      this.processor?.disconnect();
      this.source?.disconnect();
      this.silentSink?.disconnect();
    } catch {
      /* ignore */
    }
    this.processor = null;
    this.source = null;
    this.silentSink = null;
    if (this.ctx) {
      try {
        await this.ctx.close();
      } catch {
        /* ignore */
      }
      this.ctx = null;
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.listener = null;
    // Worker + model stay warm for the next session.
  }
}

export const whisperRecitationRecognizer: IRecitationRecognizer =
  new WhisperRecitationRecognizer();
