import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { audioController } from '@/services/AudioController';
import { hideBackground, showBackground, type BgAction } from '@/services/backgroundPlayback';
import { toArabicDigits } from '@/utils/arabicFormat';
import { adhkarAudio } from '@/data/adhkarAudio';
import { useAdhkarListenStore } from '@/store/adhkarListenStore';
import { toast } from '@/store/toastStore';
import type { DhikrItem } from '@/types';
import { paths } from '@/components/offline/offlineCore';
import { notifyOfflineMissing } from '@/components/offline/offlineNotice';
import { afterRecitation, countedOnce, onArrive, pauseMs, startIndex, type ListenCtx } from './listenLogic';

export type ListenPhase = 'loading' | 'reciting' | 'turn' | 'waiting' | 'paused';

export interface ListenState {
  on: boolean;
  phase: ListenPhase;
  /** Length of the current "your turn" pause, for the progress sweep. */
  turnMs: number;
  /** Recitations of the current dhikr completed in this visit ('fixed' mode n/N). */
  here?: number;
  /** Sleep timer: epoch ms when listening stops, or null. */
  sleepAt?: number | null;
  /** Sleep timer «بعد هذا الذكر». */
  sleepAfterItem?: boolean;
  /** Panel controls (carried on the state so the panel needs no extra wiring). */
  controls?: ListenControls;
}

export interface ListenControls {
  prev: () => void;
  next: () => void;
  /** Recite the current dhikr again from the start. */
  replay: () => void;
  /** Minutes (0 = off) or 'end' = stop after the current dhikr. */
  setSleep: (v: number | 'end') => void;
}

// ── Offline cache (native only): Data/offline/adhkar/<file>.mp3 ──────────────
// Same path the downloads center's «الأذكار الصوتية» pack writes to, so a
// downloaded pack is read first here.
const cachePath = paths.adhkar;

async function cachedSrc(url: string): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { uri } = await Filesystem.stat({ path: cachePath(url), directory: Directory.Data });
    return Capacitor.convertFileSrc(uri);
  } catch {
    return null;
  }
}

/** Save a recitation that just played in full, so it plays offline next time. */
async function cacheInBackground(url: string): Promise<void> {
  // Bundled clips (relative paths) are already on the device.
  if (!Capacitor.isNativePlatform() || !url.startsWith('http') || (await cachedSrc(url))) return;
  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const bytes = new Uint8Array(await res.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    await Filesystem.writeFile({ path: cachePath(url), directory: Directory.Data, data: btoa(bin), recursive: true });
  } catch {
    /* best effort — streaming still works */
  }
}

// ── MediaSession: our handlers while listening; hand back to the Quran player after.
function bindMedia(h: Partial<Record<MediaSessionAction, (() => void) | null>>): void {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
  for (const [action, fn] of Object.entries(h)) {
    try {
      navigator.mediaSession.setActionHandler(action as MediaSessionAction, fn ?? null);
    } catch {
      /* unsupported action */
    }
  }
}

function restoreQuranMedia(): void {
  bindMedia({
    play: () => audioController.resume(),
    pause: () => audioController.pause(),
    stop: () => audioController.stop(),
    previoustrack: () => audioController.prev(),
    nexttrack: () => audioController.next(),
  });
  try {
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.playbackState = 'none';
  } catch {
    /* ignore */
  }
}

interface Options {
  label: string;
  items: DhikrItem[];
  index: number;
  counts: Record<string, number>;
  skipped: Record<string, boolean>;
  /** The reader's own count path (increment + haptics + logActivity + completion). */
  countOnce: () => void;
  goTo: (index: number) => void;
}

const hasAudio = (id: string) => adhkarAudio(id) !== null;

/**
 * Listening mode: the reciter reads the current dhikr, the user gets a pause
 * to repeat after them, the counter goes up by one through the reader's normal
 * count path, and so on through the set. Prev/next (buttons, keys, media keys)
 * just move the card — whichever card becomes current is what gets recited.
 */
export function useAdhkarListen(o: Options) {
  const prefs = useAdhkarListenStore();
  const [state, setState] = useState<ListenState>({ on: false, phase: 'loading', turnMs: 0 });

  const latest = useRef({ o, prefs, state });
  latest.current = { o, prefs, state };

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const gen = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watch = useRef<ReturnType<typeof setInterval> | null>(null);
  /** URL currently loaded in the element, so repetitions seek instead of reloading. */
  const loaded = useRef<string | null>(null);
  /** What to do when resuming from 'paused'. */
  const resumeRef = useRef<(() => void) | null>(null);
  /** Recitations of the current dhikr in this visit. */
  const here = useRef(0);
  const [sleep, setSleepState] = useState<{ at: number | null; afterItem: boolean }>({ at: null, afterItem: false });
  const sleepRef = useRef(sleep);
  sleepRef.current = sleep;
  const sleepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ctx = (): ListenCtx => {
    const { o: cur, prefs: p } = latest.current;
    return { items: cur.items, counts: cur.counts, skipped: cur.skipped, hasAudio, prefs: p };
  };

  const clearWatch = () => {
    if (watch.current) clearInterval(watch.current);
    watch.current = null;
  };
  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    clearWatch();
  };

  const stop = useCallback(() => {
    gen.current += 1;
    clearTimer();
    resumeRef.current = null;
    audioRef.current?.pause();
    if (sleepTimer.current) clearTimeout(sleepTimer.current);
    sleepTimer.current = null;
    if (sleepRef.current.at || sleepRef.current.afterItem) setSleepState({ at: null, afterItem: false });
    if (!latest.current.state.on) return;
    latest.current.state = { ...latest.current.state, on: false };
    setState((s) => ({ ...s, on: false }));
    restoreQuranMedia();
    hideBackground('adhkar');
  }, []);

  const fail = useCallback(
    (offline: boolean) => {
      loaded.current = null; // retry from a fresh load next time
      stop();
      if (offline) notifyOfflineMissing('adhkar');
      else toast.error('تعذّر تشغيل التلاوة', 'تحقّق من اتصالك بالإنترنت ثم أعد المحاولة');
    },
    [stop],
  );

  const setPhase = (phase: ListenPhase, turnMs = 0) => {
    latest.current.state = { on: true, phase, turnMs, here: here.current };
    setState(latest.current.state);
  };

  /** Recite items[index] once (all its segments), then the user's turn, then count. */
  const recite = useCallback(
    (index: number) => {
      const my = ++gen.current;
      clearTimer();
      const item = latest.current.o.items[index];
      const segs = item ? adhkarAudio(item.id) : null;
      if (!item || !segs) return;
      if (!audioRef.current) {
        // NB: no crossOrigin — it breaks CORS-less CDNs in the packaged origins
        // (see AudioController.ensureElements).
        audioRef.current = document.createElement('audio');
        audioRef.current.preload = 'auto';
        audioRef.current.volume = latest.current.prefs.volume;
        audioRef.current.muted = latest.current.prefs.muted;
      }
      const audio = audioRef.current;
      let seg = 0;
      let recitedMs = 0;
      setPhase('loading');

      const endTurn = () => {
        if (my !== gen.current) return;
        resumeRef.current = null;
        // Sleep timer checked here too — a background timer can fire late.
        if (sleepRef.current.at && Date.now() >= sleepRef.current.at) return stop();
        const before = ctx();
        latest.current.o.countOnce();
        here.current += 1;
        const c = { ...before, counts: countedOnce(before, item.id) };
        const next = afterRecitation(c, index, here.current);
        // Sleep timer «بعد هذا الذكر»: this dhikr is done → stop here.
        if (next.kind !== 'again' && sleepRef.current.afterItem) return stop();
        if (next.kind === 'again') recite(index);
        else if (next.kind === 'goto') latest.current.o.goTo(next.index); // the arrival effect recites it
        else {
          stop();
          // Set complete → the reader's blessing takes over; otherwise say why we stopped.
          if (c.items.some((it) => (c.counts[it.id] ?? 0) < it.count && !c.skipped[it.id])) {
            toast.info('انتهت التلاوة المتاحة', 'بقيت أذكار بلا تلاوة، فاقرأها بنفسك');
          }
        }
      };

      const playSeg = async () => {
        const { url, from = 0, to } = segs[seg];
        let segDone = false;
        const finishSeg = () => {
          if (segDone || my !== gen.current) return;
          segDone = true;
          clearWatch();
          audio.pause();
          void cacheInBackground(url);
          const end = to ?? (Number.isFinite(audio.duration) ? audio.duration : from);
          recitedMs += (Math.max(0, end - from) * 1000) / (audio.playbackRate || 1);
          if (++seg < segs.length) return void playSeg();
          const ms = pauseMs(latest.current.prefs.pause, recitedMs);
          if (ms <= 0) return endTurn();
          setPhase('turn', ms);
          timer.current = setTimeout(endTurn, ms);
          resumeRef.current = endTurn;
        };

        audio.onplaying = () => {
          if (my !== gen.current) return;
          setPhase('reciting');
          // A trimmed segment stops at `to` (the recording goes on with a spoken note).
          clearWatch();
          if (to != null) watch.current = setInterval(() => audio.currentTime >= to && finishSeg(), 40);
        };
        // The 40ms poll is throttled to ~1s in a hidden page; timeupdate (~4/s)
        // is a media event and keeps firing in the background.
        audio.ontimeupdate = to != null ? () => audio.currentTime >= to && finishSeg() : null;
        audio.onended = finishSeg;
        audio.onerror = () => my === gen.current && fail(!navigator.onLine);
        resumeRef.current = () => void audio.play().catch(() => my === gen.current && fail(!navigator.onLine));

        // Same file as last time (the usual case: repetition n+1) → just seek.
        if (loaded.current !== url) {
          const local = await cachedSrc(url);
          if (my !== gen.current) return;
          if (!local && navigator.onLine === false) return fail(true);
          loaded.current = url;
          audio.src = local ?? url;
        }
        audio.playbackRate = latest.current.prefs.rate;
        try {
          audio.currentTime = from;
        } catch {
          /* metadata not loaded yet — handled below */
        }
        audio.onloadedmetadata = from > 0 ? () => (audio.currentTime = from) : null;
        try {
          await audio.play();
        } catch (e) {
          // A newer recitation replaced this one (AbortError) — not a failure.
          if (my === gen.current && (e as Error)?.name !== 'AbortError') fail(!navigator.onLine);
        }
      };
      void playSeg();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fail, stop],
  );

  /** Handle whichever card is current now. */
  const arrive = useCallback(
    (index: number) => {
      here.current = 0;
      const a = onArrive(ctx(), index);
      if (a.kind === 'play') recite(index);
      else if (a.kind === 'goto') latest.current.o.goTo(a.index);
      else if (a.kind === 'wait') {
        gen.current += 1;
        clearTimer();
        audioRef.current?.pause();
        resumeRef.current = null;
        setPhase('waiting');
      } else {
        stop();
        toast.info('انتهت التلاوة المتاحة', 'بقيت أذكار بلا تلاوة، فاقرأها بنفسك');
      }
    },
    [recite, stop],
  );

  /** Hold the running recitation (or the user's turn) where it is. */
  const pause = useCallback(() => {
    const s = latest.current.state;
    if (!s.on || s.phase === 'paused') return;
    clearTimer();
    audioRef.current?.pause();
    setPhase('paused');
  }, []);

  const resume = useCallback(() => {
    const s = latest.current.state;
    if (!s.on || s.phase !== 'paused') return;
    const fn = resumeRef.current;
    if (fn) {
      // Resuming during the user's turn goes straight on to the count.
      setPhase('reciting');
      fn();
    } else arrive(latest.current.o.index);
  }, [arrive]);

  const start = useCallback(() => {
    const cur = latest.current.o;
    const i = startIndex(ctx(), cur.index);
    if (i < 0) {
      toast.info(
        cur.items.some((it) => hasAudio(it.id)) ? 'أتممت أذكار هذه المجموعة' : 'لا تتوفر تلاوة لأذكار هذه المجموعة',
      );
      return;
    }
    if (audioController.snapshot().status !== 'idle') audioController.stop();
    setPhase('loading');
    bindMedia({
      play: () => resume(),
      pause: () => pause(),
      stop: () => stop(),
      previoustrack: () => latest.current.o.goTo(Math.max(0, latest.current.o.index - 1)),
      nexttrack: () => latest.current.o.goTo(Math.min(latest.current.o.items.length - 1, latest.current.o.index + 1)),
    });
    if (i !== cur.index) cur.goTo(i); // the arrival effect takes it from there
    else arrive(i);
  }, [arrive, pause, resume, stop]);

  // The current card changed while listening → recite (or skip / wait on) it.
  const currentId = o.items[o.index]?.id;
  const on = state.on;
  useEffect(() => {
    if (on) arrive(latest.current.o.index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  // Live speed / volume changes.
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = prefs.rate;
  }, [prefs.rate]);
  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = prefs.volume;
    audioRef.current.muted = prefs.muted;
  }, [prefs.volume, prefs.muted]);

  const setSleep = useCallback(
    (v: number | 'end') => {
      if (sleepTimer.current) clearTimeout(sleepTimer.current);
      sleepTimer.current = null;
      const at = typeof v === 'number' && v > 0 ? Date.now() + v * 60_000 : null;
      if (at) sleepTimer.current = setTimeout(stop, at - Date.now());
      setSleepState({ at, afterItem: v === 'end' });
    },
    [stop],
  );

  const controls: ListenControls = {
    prev: () => latest.current.o.goTo(Math.max(0, latest.current.o.index - 1)),
    next: () => latest.current.o.goTo(Math.min(latest.current.o.items.length - 1, latest.current.o.index + 1)),
    replay: () => arrive(latest.current.o.index),
    setSleep,
  };

  // Quran playback started elsewhere → yield to it.
  useEffect(() => {
    if (!on) return;
    return audioController.subscribe((s) => {
      if (s.status === 'playing' || s.status === 'loading') stop();
    });
  }, [on, stop]);

  // Lock-screen / OS media hub.
  useEffect(() => {
    if (!on || typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    try {
      if (typeof MediaMetadata !== 'undefined') {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: o.label,
          artist: 'حصن المسلم',
          album: 'رَفِيقِي — الأذكار',
        });
      }
      navigator.mediaSession.playbackState = state.phase === 'paused' ? 'paused' : 'playing';
    } catch {
      /* best effort */
    }
  }, [on, o.label, state.phase]);

  // Android: keep listening alive with the screen off (foreground service +
  // notification + lock-screen / headset buttons).
  const pos = o.index + 1;
  const total = o.items.length;
  useEffect(() => {
    if (!on) return;
    const onAction = (a: BgAction) => {
      if (a === 'play') resume();
      else if (a === 'pause') pause();
      else if (a === 'stop') stop();
      else if (a === 'next') controls.next();
      else controls.prev();
    };
    showBackground(
      'adhkar',
      { title: `${o.label} · ${toArabicDigits(pos)}/${toArabicDigits(total)}`, subtitle: 'حصن المسلم', playing: state.phase !== 'paused' && state.phase !== 'waiting' },
      onAction,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, o.label, pos, total, state.phase, pause, resume, stop]);

  useEffect(() => stop, [stop]);

  return {
    state: { ...state, sleepAt: sleep.at, sleepAfterItem: sleep.afterItem, controls },
    start,
    stop,
    pause,
    resume,
    hasAudio: currentId ? hasAudio(currentId) : false,
  };
}
