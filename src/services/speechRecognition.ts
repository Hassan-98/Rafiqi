import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';

function errMsg(e: unknown): string {
  return e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e);
}

/** Our custom native streaming recognizer (SpeechStreamPlugin.java). */
interface SpeechStreamPlugin {
  available(): Promise<{ available: boolean }>;
  requestPermission(): Promise<{ granted: boolean }>;
  start(opts: { language: string }): Promise<void>;
  setBias(opts: { words: string[] }): Promise<void>;
  stop(): Promise<void>;
  addListener(
    eventName: 'result',
    cb: (data: { text: string; isFinal: boolean }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(eventName: 'state', cb: (data: { status: string }) => void): Promise<PluginListenerHandle>;
  addListener(eventName: 'recError', cb: (data: { error: string }) => void): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

const SpeechStream = registerPlugin<SpeechStreamPlugin>('SpeechStream');

/**
 * Thin recitation-recognition abstraction used by the hifz recite engine.
 *
 * - On Android it uses our native SpeechStream plugin (continuous, partials
 *   on, re-armed natively), the only reliable on-device path.
 * - In the browser/dev it falls back to the Web Speech API so the flow is
 *   testable, though most Android WebViews don't expose it (hence the plugin).
 *
 * The recognizer streams a growing utterance transcript via `onTranscript`;
 * `isFinal` marks the utterance's last revision (the next transcript starts a
 * NEW utterance from empty). The aligner uses this to know which tokens are
 * stable enough to base mistake verdicts on.
 */
export interface RecitationListener {
  onTranscript: (text: string, isFinal: boolean) => void;
  onEnd: () => void;
  onError: (message: string) => void;
}

export interface IRecitationRecognizer {
  isSupported(): Promise<boolean>;
  requestPermission(): Promise<boolean>;
  start(language: string, listener: RecitationListener): Promise<void>;
  stop(): Promise<void>;
  /**
   * Bias recognition toward the EXPECTED upcoming words (the verse being
   * recited). On Android 13+ this feeds the on-device recognizer's
   * EXTRA_BIASING_STRINGS — the single biggest lever for Quranic vocabulary
   * on a generic recognizer. No-op where unsupported.
   */
  updateBias?(words: string[]): Promise<void>;
}

class NativeRecognizer implements IRecitationRecognizer {
  private handles: PluginListenerHandle[] = [];

  async isSupported(): Promise<boolean> {
    try {
      return (await SpeechStream.available()).available;
    } catch {
      return false;
    }
  }

  async requestPermission(): Promise<boolean> {
    try {
      return (await SpeechStream.requestPermission()).granted;
    } catch {
      return false;
    }
  }

  async updateBias(words: string[]): Promise<void> {
    try {
      // Cap the list — biasing works best with a focused set of upcoming words.
      await SpeechStream.setBias({ words: words.slice(0, 150) });
    } catch {
      /* older plugin / unsupported — ignore */
    }
  }

  async start(language: string, listener: RecitationListener): Promise<void> {
    await this.stop();
    // The native plugin streams partial transcripts continuously and re-arms
    // itself between utterances, so there's a single uninterrupted session —
    // we never restart from JS (no `onEnd`).
    this.handles.push(
      await SpeechStream.addListener('result', ({ text, isFinal }) => {
        if (text) listener.onTranscript(text, !!isFinal);
      }),
    );
    this.handles.push(
      await SpeechStream.addListener('recError', ({ error }) => {
        listener.onError(error || 'error');
      }),
    );
    try {
      await SpeechStream.start({ language });
    } catch (e) {
      listener.onError(errMsg(e));
    }
  }

  async stop(): Promise<void> {
    for (const h of this.handles) {
      try {
        await h.remove();
      } catch {
        /* ignore */
      }
    }
    this.handles = [];
    try {
      await SpeechStream.stop();
    } catch {
      /* not started */
    }
    try {
      await SpeechStream.removeAllListeners();
    } catch {
      /* ignore */
    }
  }
}

interface WebSpeechResult extends ArrayLike<{ transcript: string }> {
  isFinal?: boolean;
}

type WebSpeechCtor = new () => {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<WebSpeechResult> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

class WebRecognizer implements IRecitationRecognizer {
  private rec: InstanceType<WebSpeechCtor> | null = null;

  private ctor(): WebSpeechCtor | null {
    if (typeof window === 'undefined') return null;
    const w = window as unknown as { SpeechRecognition?: WebSpeechCtor; webkitSpeechRecognition?: WebSpeechCtor };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
  }

  async isSupported(): Promise<boolean> {
    return !!this.ctor();
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

  async start(language: string, listener: RecitationListener): Promise<void> {
    const Ctor = this.ctor();
    if (!Ctor) {
      listener.onError('unsupported');
      return;
    }
    const rec = new Ctor();
    rec.lang = language;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      let text = '';
      let isFinal = false;
      for (let i = 0; i < e.results.length; i++) {
        text += `${e.results[i][0].transcript} `;
        isFinal = !!e.results[i].isFinal;
      }
      listener.onTranscript(text.trim(), isFinal);
    };
    rec.onerror = (e) => listener.onError(e.error ?? 'error');
    rec.onend = () => listener.onEnd();
    this.rec = rec;
    try {
      rec.start();
    } catch (e) {
      listener.onError(String(e));
    }
  }

  async stop(): Promise<void> {
    try {
      this.rec?.stop();
    } catch {
      /* ignore */
    }
    this.rec = null;
  }
}

export const recitationRecognizer: IRecitationRecognizer = Capacitor.isNativePlatform()
  ? new NativeRecognizer()
  : new WebRecognizer();

/**
 * Resolve the recognizer for a recitation session.
 *
 * - Android → the native SpeechStream plugin (system recognizer + biasing).
 *   The phone-side on-device AI engines were removed (2026-06-11) after real
 *   device testing: nothing public matched Tarteel-grade accuracy on a phone.
 * - Desktop (Electron) → the on-device Quran-tuned Whisper engine. Electron's
 *   Chromium ships NO speech backend (Web Speech `start()` always errors with
 *   `network`), and unlike phones a desktop has the compute for whisper-base
 *   (WebGPU/WASM). Also used in any browser lacking the Web Speech API.
 * - Regular browsers with Web Speech keep using it (dev/testing path).
 */
export async function getRecitationRecognizer(): Promise<IRecitationRecognizer> {
  if (Capacitor.isNativePlatform()) return recitationRecognizer;
  const w = window as unknown as {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  };
  const desktopShell = document.documentElement.dataset.shell === 'desktop';
  if (desktopShell || (!w.SpeechRecognition && !w.webkitSpeechRecognition)) {
    const { whisperRecitationRecognizer } = await import('./whisperRecitationRecognizer');
    return whisperRecitationRecognizer;
  }
  return recitationRecognizer;
}
