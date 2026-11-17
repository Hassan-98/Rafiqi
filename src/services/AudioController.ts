import type { AudioTrack, Qari, Word } from '@/types';
import { EVERYAYAH_FOLDERS } from '@/types';
import { surahs } from '@/data/surahs';
import { quranApiService } from './QuranApiService';
import { toast } from '@/store/toastStore';
import { nextStep } from '@/services/audio/sequence';
import { analyseTail, knownTailEnd } from '@/services/audio/silenceTrim';
import { useDownloadsStore } from '@/store/downloadsStore';
import { isOffline, notifyOfflineMissing, OfflineMissingError } from '@/components/offline/offlineNotice';
import { hideBackground, showBackground, type BgAction } from './backgroundPlayback';

export type PlaybackMode = 'single' | 'range' | 'full-surah' | 'word-by-word';
export type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused';

/** Arabic reciter display names — shared by the player bar and MediaSession. */
/** Arabic reciter names. Typed against `Qari`, so adding a reciter without
 *  an Arabic name is a compile error (dossari/maher/tablawi used to fall
 *  back to their English ids in the player bar). */
const QARI_NAMES: Record<Qari, string> = {
  alafasy: 'مشاري العفاسي',
  husary_muallim: 'الحصري (المعلّم)',
  fares: 'فارس عباد',
  ghamdi: 'سعد الغامدي',
  ajmy: 'أحمد بن علي العجمي',
  basfar: 'عبد الله بصفر',
  juhany: 'عبد الله عواد الجهني',
  jibreel: 'محمد جبريل',
  qatami: 'ناصر القطامي',
  ali_jaber: 'علي جابر',
  bukhatir: 'صلاح بو خاطر',
  ayyoub: 'محمد أيوب',
  hudhaify: 'علي الحذيفي',
  akhdar: 'إبراهيم الأخضر',
  qahtani: 'خالد القحطاني',
  matroud: 'عبد الله المطرود',
  yaser_salamah: 'ياسر سلامة',
  banna: 'محمود علي البنا',
  mustafa_ismail: 'مصطفى إسماعيل',
  minshawi_mujawwad: 'محمد صديق المنشاوي (مجوّد)',
  husary_mujawwad: 'محمود خليل الحصري (مجوّد)',
  abdulbasit_murattal: 'عبد الباسط عبد الصمد (مرتل)',
  maher: 'ماهر المعيقلي',
  dossari: 'ياسر الدوسري',
  husary: 'محمود خليل الحصري',
  minshawi: 'محمد صديق المنشاوي',
  abdulbasit: 'عبد الباسط عبد الصمد',
  sudais: 'عبد الرحمن السديس',
  shuraim: 'سعود الشريم',
  shatri: 'أبو بكر الشاطري',
  rifai: 'هاني الرفاعي',
  tablawi: 'محمد الطبلاوي',
};
export const QARI_LABELS: Record<string, string> = {
  ...QARI_NAMES,
  // Legacy ids that may still sit in persisted settings.
  ajmy: 'أحمد العجمي',
  basfar: 'عبد الله بصفر',
};

export interface ControllerSnapshot {
  status: PlaybackStatus;
  currentVerseKey: string | null;
  queueIndex: number;
  queueLength: number;
  mode: PlaybackMode;
  qari: Qari;
  repeatRemaining: number;
  /** Total repeats requested for the current single-verse loop (1 = no loop). */
  repeatTotal: number;
  currentWordPosition: number | null;
  /** Whole-queue passes requested after the first (0 = none, Infinity = loop). */
  loopsTotal: number;
  loopsRemaining: number;
  /** Sleep timer: epoch ms when playback stops, or null. */
  sleepAt: number | null;
  /** Sleep timer «نهاية السورة». */
  stopAtSurahEnd: boolean;
}

/** Sleep timer choice: minutes from now, the end of the surah, or off. */
export type SleepChoice = number | 'surah-end' | null;

/** A stalled load (host slow or blocked on the user's network) must not leave
 *  the player stuck on «loading» forever — try the other host, then fail. */
const LOAD_TIMEOUT_MS = 12_000;

/** The same everyayah file on the other host (they mirror each other), or null. */
function altHost(url: string): string | null {
  const m = /^https:\/\/(everyayah\.com\/data|mirrors\.quranicaudio\.com\/everyayah)\/(.+)$/.exec(url);
  if (!m) return null;
  return m[1] === 'everyayah.com/data'
    ? `https://mirrors.quranicaudio.com/everyayah/${m[2]}`
    : `https://everyayah.com/data/${m[2]}`;
}

type Listener = (s: ControllerSnapshot) => void;
type WordListener = (verseKey: string, wordPosition: number | null) => void;
/** Playback time channel — kept SEPARATE from the main snapshot so the heavy
 *  Mushaf page (which subscribes to the snapshot) doesn't re-render on every
 *  timeupdate. Only the lightweight seek bar listens here. */
type TimeListener = (currentMs: number, durationMs: number) => void;

/**
 * Singleton audio controller for Quran recitation playback. Wraps two
 * `<audio>` elements (primary + preloader) for gapless verse-to-verse
 * transitions. State machine handles:
 *   - `single`     : play one verse once (or with repeat).
 *   - `range`      : play a generated queue of verses.
 *   - `full-surah` : play one chapter MP3 covering all verses.
 *   - `word-by-word`: sequence per-word MP3s for the active verse.
 *
 * State is not persisted — by design (Phase 1B). The next phase will tie
 * "completed verses" into wird progress.
 */
class AudioControllerImpl {
  private primary: HTMLAudioElement | null = null;
  private preloader: HTMLAudioElement | null = null;

  private queue: string[] = [];
  private index = 0;
  private mode: PlaybackMode = 'single';
  private qari: Qari = 'husary';
  private repeatTotal = 0;
  private repeatRemaining = 0;
  private delayMs = 0;
  private status: PlaybackStatus = 'idle';
  private currentSegments: { wordPosition: number; startMs: number; endMs: number }[] | undefined;
  private currentWordPos: number | null = null;
  private playbackRate = 1;
  private durationMs = 0;
  private currentTimeMs = 0;
  private lastTimeEmit = 0;
  private loopsTotal = 0;
  private loopsRemaining = 0;
  /** Pause between ayat (and between repetitions), from the user's settings. */
  private gapMs = 0;
  private volume = 1;
  private muted = false;
  private sleepAt: number | null = null;
  private sleepTimer: ReturnType<typeof setTimeout> | null = null;
  private stopAtSurahEnd = false;
  /** The next step, waiting out the gap between ayat (run early on resume). */
  private pending: (() => void) | null = null;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  /** «تخطّي الصمت في نهاية الآية» (+ the Muallim's built-in pause exemption). */
  private trimSilence = true;
  private keepMuallimPause = false;
  /** Current ayah file and where its recitation really ends (s), if trimmed. */
  private currentUrl: string | null = null;
  private tailEnd: number | null = null;
  private tailTimer: ReturnType<typeof setTimeout> | null = null;
  /** We paused at the tail ourselves — not a user pause. */
  private cut = false;
  private rawDurationMs = 0;
  /** Bumped by every new load and by stop(): a slower, older load that
   *  finishes (or fails) late must not stop or override the current one. */
  private loadSeq = 0;

  private listeners = new Set<Listener>();
  private wordListeners = new Set<WordListener>();
  private timeListeners = new Set<TimeListener>();

  private ensureElements(): { primary: HTMLAudioElement; preloader: HTMLAudioElement } {
    if (typeof document === 'undefined') {
      throw new Error('AudioController requires a DOM');
    }
    if (!this.primary) {
      this.primary = document.createElement('audio');
      this.primary.preload = 'auto';
      // NB: deliberately NO `crossOrigin` — these elements only PLAY the audio
      // (we never read their samples via Web Audio / canvas), and setting
      // crossOrigin='anonymous' forces a CORS check that the recitation CDNs
      // don't satisfy for the app's non-web origin (desktop `app://`, Android
      // `https://localhost`). That made every per-ayah recitation fail to load
      // in the packaged apps ("the reciter doesn't work"). A plain media
      // request plays cross-origin audio without needing CORS headers.
      this.primary.addEventListener('ended', this.onEnded);
      this.primary.addEventListener('timeupdate', this.onTimeUpdate);
      this.primary.addEventListener('playing', () => {
        this.cut = false;
        this.setStatus('playing');
      });
      this.primary.addEventListener('pause', () => {
        // A track that simply ENDED also fires 'pause' — that's the gap before
        // the next ayah/repetition, not the user pausing.
        if (this.status === 'playing' && !this.primary?.ended && !this.cut) this.setStatus('paused');
      });
      const onDuration = () => {
        const d = this.primary?.duration ?? 0;
        this.rawDurationMs = Number.isFinite(d) ? d * 1000 : 0;
        this.refreshDuration();
      };
      this.primary.addEventListener('loadedmetadata', onDuration);
      this.primary.addEventListener('durationchange', onDuration);
      this.primary.addEventListener('error', () => {
        console.warn('[AudioController] primary audio error', this.primary?.error);
      });
    }
    if (!this.preloader) {
      this.preloader = document.createElement('audio');
      this.preloader.preload = 'auto';
      // No crossOrigin — see the note on `primary` above.
    }
    this.applyVolume(this.primary);
    return { primary: this.primary, preloader: this.preloader };
  }

  /** Sleep timer, checked on audio events too — a background timer can fire late. */
  private sleepDue(): boolean {
    return this.sleepAt != null && Date.now() >= this.sleepAt;
  }

  private onEnded = () => {
    if (this.sleepDue()) return this.stop();
    const step = nextStep({
      queue: this.queue,
      index: this.index,
      repeatRemaining: this.repeatRemaining,
      loopsRemaining: this.loopsRemaining,
      stopAtSurahEnd: this.stopAtSurahEnd,
    });
    if (step.kind === 'stop') {
      this.stop();
      return;
    }
    const run = () => {
      this.clearPending();
      if (step.kind === 'repeat') {
        this.repeatRemaining -= 1;
        this.replay();
        this.emit();
        return;
      }
      if (step.kind === 'loop') this.loopsRemaining -= 1;
      this.repeatRemaining = Math.max(0, this.repeatTotal - 1);
      if (step.index === this.index) {
        this.replay(); // one-track queue: a single ayah or a whole-surah file
        this.emit();
      } else {
        this.index = step.index;
        void this.playCurrent();
      }
    };
    const delay = Math.max(this.delayMs, this.gapMs);
    if (delay > 0) {
      this.pending = run;
      this.pendingTimer = setTimeout(run, delay);
    } else run();
  };

  private replay(): void {
    if (!this.primary) return;
    this.primary.currentTime = 0;
    void this.primary.play().catch(() => undefined);
  }

  /** Clear the previous track's time so the bar never shows stale 0:04/0:05. */
  private resetTime(): void {
    this.currentTimeMs = 0;
    this.rawDurationMs = 0;
    this.refreshDuration();
  }

  /** src + play() with a timeout, falling back to the mirror host once.
   *  `trimTail` is false for whole-chapter files (no per-ayah silent tail). */
  private async startSource(url: string, seq: number, trimTail = true): Promise<void> {
    const p = this.primary!;
    let lastErr: unknown;
    for (const src of [url, altHost(url)]) {
      if (!src || seq !== this.loadSeq) break;
      p.src = src;
      p.playbackRate = this.playbackRate;
      this.setTail(trimTail ? src : null);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          p.play(),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`audio load timed out: ${src}`)), LOAD_TIMEOUT_MS);
          }),
        ]);
        return;
      } catch (e) {
        // Autoplay refusal isn't a host problem — another host won't help.
        if ((e as DOMException)?.name === 'NotAllowedError') throw e;
        lastErr = e;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastErr;
  }

  private clearPending(): void {
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    this.pendingTimer = null;
    this.pending = null;
  }

  private onTimeUpdate = () => {
    if (!this.primary) return;
    const ms = this.primary.currentTime * 1000;
    this.currentTimeMs = ms;
    if (this.sleepDue()) return this.stop();
    this.emitTime();
    this.checkTail();

    if (!this.currentSegments) return;
    const seg = this.currentSegments.find((s) => ms >= s.startMs && ms <= s.endMs);
    const next = seg?.wordPosition ?? null;
    if (next !== this.currentWordPos) {
      this.currentWordPos = next;
      this.emitWord();
    }
  };

  // ── Silent-tail skipping ───────────────────────────────────────────────
  private trimActive(): boolean {
    return this.trimSilence && !(this.keepMuallimPause && this.qari === 'husary_muallim');
  }

  /** The bar's duration = where the recitation ends (seek can't enter the tail). */
  private refreshDuration(): void {
    const tail = this.tailEnd ? this.tailEnd * 1000 : Infinity;
    this.durationMs = Math.min(this.rawDurationMs, tail) || this.rawDurationMs;
    this.emitTime(true);
  }

  /** Point the tail at `url` (known result now, else analyse in the background). */
  private setTail(url: string | null): void {
    this.currentUrl = url;
    const known = url && this.trimActive() ? knownTailEnd(url) : 0;
    this.tailEnd = known || null;
    this.refreshDuration();
    if (url && known === undefined) {
      void analyseTail(url).then((end) => {
        if (this.currentUrl !== url || !this.trimActive()) return;
        this.tailEnd = end || null;
        this.refreshDuration();
      });
    }
  }

  /** timeupdate is coarse (~250ms): arm a precise timer for the last stretch. */
  private checkTail(): void {
    const p = this.primary;
    if (!p || this.tailEnd == null || p.paused || this.tailTimer) return;
    const left = this.tailEnd - p.currentTime;
    if (left > 0.6) return;
    this.tailTimer = setTimeout(() => {
      this.tailTimer = null;
      if (!p || p.paused || this.tailEnd == null) return;
      if (p.currentTime < this.tailEnd - 0.05) return this.checkTail(); // seeked / drift
      this.cut = true;
      p.pause();
      this.onEnded(); // exactly as a natural end: gap, repeat, advance, sleep
    }, Math.max(0, (left * 1000) / (p.playbackRate || 1)));
  }

  /** Settings → controller. Re-evaluates the current ayah immediately. */
  setTrimSilence(on: boolean, keepMuallimPause: boolean): void {
    this.trimSilence = on;
    this.keepMuallimPause = keepMuallimPause;
    if (this.currentUrl) this.setTail(this.currentUrl);
  }

  /** Throttled (~5/sec) time emit on its own channel. `force` bypasses the
   *  throttle for discrete events (seek, metadata load). */
  private emitTime(force = false): void {
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    if (!force && now - this.lastTimeEmit < 200) return;
    this.lastTimeEmit = now;
    this.timeListeners.forEach((l) => l(this.currentTimeMs, this.durationMs));
    this.updateMediaPosition();
  }

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    cb(this.snapshot());
    return () => this.listeners.delete(cb);
  }

  subscribeWord(cb: WordListener): () => void {
    this.wordListeners.add(cb);
    return () => this.wordListeners.delete(cb);
  }

  subscribeTime(cb: TimeListener): () => void {
    this.timeListeners.add(cb);
    cb(this.currentTimeMs, this.durationMs);
    return () => this.timeListeners.delete(cb);
  }

  /** Seek to an absolute position in milliseconds. */
  seek(ms: number): void {
    if (!this.primary) return;
    const clamped = Math.max(0, Math.min(this.durationMs, ms));
    try {
      this.primary.currentTime = clamped / 1000;
      this.currentTimeMs = clamped;
      this.emitTime(true);
    } catch {
      /* ignore */
    }
  }

  snapshot(): ControllerSnapshot {
    return {
      status: this.status,
      currentVerseKey: this.queue[this.index] ?? null,
      queueIndex: this.index,
      queueLength: this.queue.length,
      mode: this.mode,
      qari: this.qari,
      repeatRemaining: this.repeatRemaining,
      repeatTotal: this.repeatTotal,
      currentWordPosition: this.currentWordPos,
      loopsTotal: this.loopsTotal,
      loopsRemaining: this.loopsRemaining,
      sleepAt: this.sleepAt,
      stopAtSurahEnd: this.stopAtSurahEnd,
    };
  }

  private setStatus(s: PlaybackStatus) {
    if (this.status === s) return;
    this.status = s;
    this.emit();
  }

  private emit() {
    const snap = this.snapshot();
    this.listeners.forEach((l) => l(snap));
    this.updateMediaSession();
    this.updateBackground();
  }

  // ── Android background session (notification + wake lock, see backgroundPlayback.ts)
  private updateBackground(): void {
    if (this.status === 'idle') return hideBackground('quran');
    showBackground(
      'quran',
      { title: this.mediaTitle() ?? 'تلاوة القرآن', subtitle: QARI_LABELS[this.qari] ?? this.qari, playing: this.status !== 'paused' },
      this.onBgAction,
    );
  }

  private onBgAction = (a: BgAction): void => {
    if (a === 'play') this.resume();
    else if (a === 'pause') this.pause();
    else if (a === 'next') this.next();
    else if (a === 'prev') this.prev();
    else this.stop();
  };

  /** «سورة X — الآية N» for the current track (null when nothing is queued). */
  private mediaTitle(): string | null {
    const verseKey = this.queue[this.index];
    if (!verseKey) return null;
    const surah = surahs.find((s) => s.number === Number(verseKey.split(':')[0]));
    const ayah = verseKey.split(':')[1];
    if (!surah) return verseKey;
    return this.mode === 'full-surah' ? `سورة ${surah.nameArabic}` : `سورة ${surah.nameArabic} — الآية ${ayah}`;
  }

  // ── MediaSession: lock-screen / media-key / OS-overlay controls ──────
  // Surfaced where the platform supports it (Electron/desktop Chrome media
  // hub). Android's WebView doesn't surface it: there the native foreground
  // service (updateBackground) provides the notification and media buttons.
  private mediaSessionReady = false;

  private ensureMediaSession(): void {
    if (this.mediaSessionReady || typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    this.mediaSessionReady = true;
    const ms = navigator.mediaSession;
    const bind = (action: MediaSessionAction, fn: () => void) => {
      try {
        ms.setActionHandler(action, fn);
      } catch {
        /* action unsupported on this engine */
      }
    };
    bind('play', () => this.resume());
    bind('pause', () => this.pause());
    bind('stop', () => this.stop());
    bind('previoustrack', () => this.prev());
    bind('nexttrack', () => this.next());
    try {
      ms.setActionHandler('seekto', (d) => {
        if (d.seekTime != null) this.seek(d.seekTime * 1000);
      });
    } catch {
      /* ignore */
    }
  }

  private updateMediaSession(): void {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    this.ensureMediaSession();
    const ms = navigator.mediaSession;
    ms.playbackState =
      this.status === 'playing' ? 'playing' : this.status === 'paused' ? 'paused' : 'none';
    const title = this.mediaTitle();
    if (!title || typeof MediaMetadata === 'undefined') return;
    try {
      ms.metadata = new MediaMetadata({
        title,
        artist: QARI_LABELS[this.qari] ?? this.qari,
        album: 'رَفِيقِي — تلاوة القرآن',
      });
    } catch {
      /* metadata is best-effort */
    }
  }

  /** Feed the OS scrubber (throttled by emitTime's own 200ms gate). */
  private updateMediaPosition(): void {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    if (this.durationMs <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: this.durationMs / 1000,
        position: Math.min(this.currentTimeMs, this.durationMs) / 1000,
        playbackRate: this.playbackRate,
      });
    } catch {
      /* ignore */
    }
  }

  private emitWord() {
    const verseKey = this.queue[this.index] ?? null;
    if (!verseKey) return;
    this.wordListeners.forEach((l) => l(verseKey, this.currentWordPos));
  }

  setQari(q: Qari): void {
    this.qari = q;
  }

  /**
   * Switch reciter and apply it IMMEDIATELY — reloads the currently-playing
   * verse/surah from the new reciter at the same position, instead of only
   * taking effect on the next play (the bug the user hit where the change
   * "didn't apply until leaving and re-entering").
   */
  changeQari(q: Qari): void {
    if (this.qari === q) return;
    this.qari = q;
    if (this.status === 'idle' || this.queue.length === 0) return;
    if (this.mode === 'full-surah') {
      const chapterId = Number(this.queue[0]?.split(':')[0]);
      if (Number.isFinite(chapterId)) void this.playFullSurah(chapterId, q);
    } else if (this.mode === 'single' || this.mode === 'range') {
      void this.playCurrent();
    }
    this.emit();
  }
  setPlaybackRate(r: number): void {
    this.playbackRate = r;
    if (this.primary) this.primary.playbackRate = r;
  }

  /** «مستوى صوت التلاوة» 0..1, relative to the device's media volume (the
   *  hardware keys keep controlling that). */
  setVolume(v: number, muted = this.muted): void {
    this.volume = Math.max(0, Math.min(1, v));
    this.muted = muted;
    this.applyVolume(this.primary);
    this.applyVolume(this.wordPreview);
  }

  private applyVolume(el: HTMLAudioElement | null): void {
    if (!el) return;
    el.volume = this.volume;
    el.muted = this.muted;
  }

  /** Pause between ayat and between repetitions (ms). */
  setAyahGap(ms: number): void {
    this.gapMs = Math.max(0, ms);
  }

  /** Repeat each ayah N times (1 = off). Restarts the count on the current ayah. */
  setVerseRepeat(n: number): void {
    this.repeatTotal = Math.max(1, Math.round(n));
    this.repeatRemaining = this.repeatTotal - 1;
    this.emit();
  }

  /** Extra passes over the whole queue (0 = off, Infinity = loop). */
  setQueueLoops(n: number): void {
    this.loopsTotal = Math.max(0, n);
    this.loopsRemaining = this.loopsTotal;
    this.emit();
  }

  /** Stop after N minutes, at the end of the surah, or cancel (null). */
  setSleepTimer(choice: SleepChoice): void {
    if (this.sleepTimer) clearTimeout(this.sleepTimer);
    this.sleepTimer = null;
    this.sleepAt = null;
    this.stopAtSurahEnd = choice === 'surah-end';
    if (typeof choice === 'number' && choice > 0) {
      const ms = choice * 60_000;
      this.sleepAt = Date.now() + ms;
      this.sleepTimer = setTimeout(() => this.stop(), ms);
    }
    this.emit();
  }

  async playQueue(
    queue: string[],
    mode: PlaybackMode = 'single',
    opts: { qari?: Qari; repeat?: number; delayMs?: number; startIndex?: number; loops?: number } = {},
  ): Promise<void> {
    if (queue.length === 0) return;
    this.queue = queue;
    this.mode = mode;
    this.index = opts.startIndex ?? 0;
    this.qari = opts.qari ?? this.qari;
    this.repeatTotal = opts.repeat ?? 1;
    this.repeatRemaining = Math.max(0, this.repeatTotal - 1);
    this.delayMs = opts.delayMs ?? 0;
    this.loopsTotal = Math.max(0, opts.loops ?? 0);
    this.loopsRemaining = this.loopsTotal;
    await this.playCurrent();
  }

  async playFullSurah(chapterId: number, qari?: Qari): Promise<void> {
    const q = qari ?? this.qari;
    this.qari = q;

    // everyayah reciters have no single full-surah file — play the surah as a
    // gapless per-ayah queue instead. Same when the surah is downloaded (or we
    // are offline): the per-ayah queue plays the files on disk.
    if (EVERYAYAH_FOLDERS[q] || useDownloadsStore.getState().audioIndex[q]?.[chapterId] === true || isOffline()) {
      const meta = surahs.find((s) => s.number === chapterId);
      const count = meta?.versesCount ?? 0;
      if (count > 0) {
        const queue = Array.from({ length: count }, (_, i) => `${chapterId}:${i + 1}`);
        await this.playQueue(queue, 'full-surah', { qari: q });
        return;
      }
    }

    this.ensureElements();
    const seq = ++this.loadSeq;
    this.clearPending();
    this.resetTime();
    this.setStatus('loading');
    try {
      const { url } = await quranApiService.getChapterRecitation(chapterId, q);
      if (seq !== this.loadSeq) return;
      this.mode = 'full-surah';
      this.queue = [`${chapterId}:full`];
      this.index = 0;
      this.repeatTotal = 1;
      this.repeatRemaining = 0;
      this.loopsTotal = 0;
      this.loopsRemaining = 0;
      this.currentSegments = undefined;
      this.currentWordPos = null;
      await this.startSource(url, seq, false);
    } catch (e) {
      if (seq !== this.loadSeq) return; // a newer load took over
      console.warn('[AudioController] full-surah play failed', e);
      this.stop();
      toast.error('تعذّر تشغيل التلاوة', 'تحقّق من اتصالك بالإنترنت ثم أعد المحاولة');
    }
  }

  private wordPreview: HTMLAudioElement | null = null;

  /**
   * Play a single word's recitation as a transient preview (the "interactive
   * dictionary" mode). Uses its own audio element so it never disturbs the
   * main recitation queue/player.
   */
  playWordPreview(word: Word): void {
    if (typeof document === 'undefined') return;
    const url = quranApiService.getWordAudioUrl(word);
    if (!url) return;
    if (!this.wordPreview) {
      this.wordPreview = document.createElement('audio');
      // No crossOrigin — see the note in ensureElements().
    }
    this.applyVolume(this.wordPreview);
    this.wordPreview.src = url;
    this.wordPreview.playbackRate = this.playbackRate;
    void this.wordPreview.play().catch(() => undefined);
  }

  async playWordByWord(verseKey: string, words: Word[]): Promise<void> {
    const { primary } = this.ensureElements();
    this.clearPending();
    const urls = words
      .filter((w) => w.charType !== 'end')
      .map((w) => quranApiService.getWordAudioUrl(w))
      .filter((u): u is string => !!u);
    if (urls.length === 0) return;
    this.loadSeq++;
    this.mode = 'word-by-word';
    this.queue = urls.map((_, i) => `${verseKey}#w${i + 1}`);
    this.index = 0;
    this.repeatTotal = 1;
    this.repeatRemaining = 0;
    this.currentSegments = undefined;
    this.currentWordPos = null;
    this.setTail(null);
    primary.src = urls[0];
    primary.playbackRate = this.playbackRate;
    await primary.play().catch(() => undefined);
  }

  private async playCurrent(): Promise<void> {
    const { preloader } = this.ensureElements();
    const verseKey = this.queue[this.index];
    if (!verseKey) {
      this.stop();
      return;
    }
    const seq = ++this.loadSeq;
    this.clearPending();
    this.resetTime();
    this.setStatus('loading');
    try {
      const track: AudioTrack = await quranApiService.getRecitation(verseKey, this.qari);
      if (seq !== this.loadSeq) return;
      this.currentSegments = track.segments;
      this.currentWordPos = null;
      // Preload next track for gapless transition (+ analyse its silent tail).
      const next = this.queue[this.index + 1];
      if (next) {
        quranApiService.getRecitation(next, this.qari).then(
          (t) => {
            preloader.src = t.url;
            if (this.trimActive()) void analyseTail(t.url);
          },
          () => undefined,
        );
      }
      await this.startSource(track.url, seq);
      if (seq === this.loadSeq) this.emit();
    } catch (e) {
      // Superseded (next/prev/reciter change while loading): the old load's
      // abort must not stop the new track.
      if (seq !== this.loadSeq) return;
      console.warn('[AudioController] play failed', verseKey, e);
      this.stop();
      if (e instanceof OfflineMissingError || isOffline()) notifyOfflineMissing('audio');
      else toast.error('تعذّر تشغيل التلاوة', 'تحقّق من اتصالك بالإنترنت ثم أعد المحاولة');
    }
  }

  pause(): void {
    // Paused inside the gap between ayat: hold the next step until resume.
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    this.pendingTimer = null;
    this.primary?.pause();
    this.setStatus('paused');
  }
  resume(): void {
    if (this.pending) {
      this.setStatus('playing');
      this.pending();
      return;
    }
    if (this.primary?.src) {
      void this.primary.play().catch(() => undefined);
      this.setStatus('playing');
    }
  }
  stop(): void {
    this.loadSeq++; // cancel any load still in flight
    if (this.primary) {
      this.primary.pause();
      try {
        this.primary.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
    this.clearPending();
    if (this.tailTimer) clearTimeout(this.tailTimer);
    this.tailTimer = null;
    this.setTail(null);
    if (this.sleepTimer) clearTimeout(this.sleepTimer);
    this.sleepTimer = null;
    this.sleepAt = null;
    this.stopAtSurahEnd = false;
    this.queue = [];
    this.index = 0;
    this.repeatRemaining = 0;
    this.loopsTotal = 0;
    this.loopsRemaining = 0;
    this.currentSegments = undefined;
    this.currentWordPos = null;
    this.resetTime();
    this.setStatus('idle');
  }
  next(): void {
    if (this.index < this.queue.length - 1) {
      this.index += 1;
      this.repeatRemaining = Math.max(0, this.repeatTotal - 1);
      void this.playCurrent();
    }
  }
  prev(): void {
    if (this.index > 0) {
      this.index -= 1;
      this.repeatRemaining = Math.max(0, this.repeatTotal - 1);
      void this.playCurrent();
    }
  }
}

export const audioController = new AudioControllerImpl();
