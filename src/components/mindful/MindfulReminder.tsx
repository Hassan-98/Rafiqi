import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { create } from 'zustand';
import { Feather } from 'lucide-react';
import { motion, AnimatePresence } from '@/lib/motion';
import { Button } from '@/components/ui/Button';
import { OrnamentRule } from '@/components/ui/Ornament';
import { useCloseOnBack } from '@/lib/overlayBack';
import { useSettingsStore } from '@/store/settingsStore';
import { useMindfulStore } from '@/store/mindfulStore';
import { useAlertSound } from '@/services/notifications/DesktopNotificationService';
import { lastDeepLinkTime } from '@/services/notifications/actions';
import {
  canShowMindful, composeMindful, contextForRoute, dayKey, nextVariant, recordShown, type MindfulContext,
} from '@/services/mindful';
import { MINDFUL_KICKER, MINDFUL_REMINDERS } from '@/data/mindfulReminders';

const OPEN_DELAY_MS = 1500;
const SECTION_DELAY_MS = 900;
/** A notification / deep link just opened the app: let the user act on it first. */
const DEEP_LINK_GRACE_MS = 2 * 60 * 1000;
const TICK_MS = 34;
/** Pause between salutation, body and quote, in ticks. */
const PAUSE_TICKS = 16;
/** A typist's breath after punctuation, in ticks. */
const PUNCT_TICKS: Record<string, number> = { '،': 5, ',': 5, '؛': 7, '.': 9, '؟': 9, '!': 9, '—': 6, ':': 5 };

const useShown = create<{ shown: { ctx: MindfulContext; variant: number } | null }>(() => ({ shown: null }));
const closeMindful = () => useShown.setState({ shown: null });

/** «تذاكر الإتقان» page: show one now (a given one, or any at random) — never counted in the ledger. */
export function previewMindful(ctx?: MindfulContext, variant?: number): void {
  const all = Object.keys(MINDFUL_REMINDERS) as MindfulContext[];
  const c = ctx ?? all[Math.floor(Math.random() * all.length)];
  const v = variant ?? Math.floor(Math.random() * MINDFUL_REMINDERS[c].length);
  useShown.setState({ shown: { ctx: c, variant: v } });
}

/** Show `ctx` now when services/mindful allows it (plus the live checks). */
function tryShow(ctx: MindfulContext): void {
  const d = useMindfulStore.getState();
  const busy =
    document.visibilityState !== 'visible' ||
    !!useAlertSound.getState().title ||
    !!useShown.getState().shown ||
    !!document.querySelector('[aria-modal="true"]');
  const gate = {
    onboardingComplete: useSettingsStore.getState().onboardingComplete,
    deepLinked: Date.now() - lastDeepLinkTime() < DEEP_LINK_GRACE_MS,
    busy,
  };
  if (!canShowMindful(ctx, d, gate)) return;
  const variant = nextVariant(ctx, d);
  useMindfulStore.setState(recordShown(d, ctx, variant));
  useShown.setState({ shown: { ctx, variant } });
}

/**
 * «تذكرة الإتقان»: lays a full-screen reminder over the app when
 * services/mindful allows — «تذكرة اليوم» from its random morning moment on
 * whatever screen is open, and each section's own when it is opened.
 * Mounted once in App's RootLayout.
 */
export function MindfulReminder() {
  const { pathname, search } = useLocation();
  const shown = useShown((s) => s.shown);
  const gender = useSettingsStore((s) => s.gender);

  useEffect(() => {
    if (!useMindfulStore.getState().firstSeen) useMindfulStore.setState({ firstSeen: dayKey(new Date()) });
  }, []);

  // A section's own reminder, when it is opened.
  useEffect(() => {
    const ctx = contextForRoute(pathname, search);
    if (!ctx || ctx === 'open') return;
    const t = setTimeout(() => tryShow(ctx), SECTION_DELAY_MS);
    return () => clearTimeout(t);
  }, [pathname, search]);

  // «تذكرة اليوم»: checked on every move and each minute, so its moment finds the user wherever they are.
  useEffect(() => {
    const t = setTimeout(() => tryShow('open'), OPEN_DELAY_MS);
    const i = setInterval(() => tryShow('open'), 60_000);
    const onVisible = () => document.visibilityState === 'visible' && setTimeout(() => tryShow('open'), OPEN_DELAY_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(t);
      clearInterval(i);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [pathname]);

  return (
    <AnimatePresence>
      {shown ? (
        <MindfulCard
          key={`${shown.ctx}-${shown.variant}`}
          ctx={shown.ctx}
          variant={shown.variant}
          gender={gender}
          onClose={closeMindful}
        />
      ) : null}
    </AnimatePresence>
  );
}

type Segmenter = new (locale: string, o: { granularity: 'grapheme' }) => { segment(s: string): Iterable<{ segment: string }> };
const Segmenter = (Intl as unknown as { Segmenter?: Segmenter }).Segmenter;

/** Letters with their harakat, so typing never shows a bare letter then its mark. */
function graphemes(s: string): string[] {
  return Segmenter ? Array.from(new Segmenter('ar', { granularity: 'grapheme' }).segment(s), (x) => x.segment) : Array.from(s);
}

function MindfulCard({
  ctx,
  variant,
  gender,
  onClose,
}: {
  ctx: MindfulContext;
  variant: number;
  gender: ReturnType<typeof useSettingsStore.getState>['gender'];
  onClose: () => void;
}) {
  const screen = useRef<HTMLDivElement>(null);
  const c = useMemo(() => composeMindful(ctx, variant, gender), [ctx, variant, gender]);
  /** Every grapheme gets the tick it appears on — punctuation leaves a breath after it. */
  const seg = useMemo(() => {
    const parts = [c.salutation, c.body, c.quote.text].map(graphemes);
    let at = 0;
    const ticks = parts.map((p) => {
      const t = p.map((g) => {
        at += 1 + (PUNCT_TICKS[g] ?? 0);
        return at;
      });
      at += PAUSE_TICKS;
      return t;
    });
    return { parts, ticks, total: at };
  }, [c]);

  const [n, setN] = useState(() =>
    useSettingsStore.getState().reduceMotion || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      ? seg.total
      : 0,
  );
  const done = n >= seg.total;
  useEffect(() => {
    if (done) return;
    const id = setInterval(() => setN((x) => x + 1), TICK_MS);
    return () => clearInterval(id);
  }, [done]);

  // Owner 2026-11-18: it can't be closed or skipped before it is written in full —
  // reading it whole is the point. Back/Esc do nothing until then (closeTopOverlay
  // still consumes back, so nothing navigates underneath).
  const doneRef = useRef(done);
  doneRef.current = done;
  useCloseOnBack(true, () => {
    if (doneRef.current) onClose();
  });
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    document.body.classList.add('modal-open');
    screen.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && doneRef.current) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('modal-open');
      prev?.focus?.();
    };
  }, [onClose]);

  /** Index of the part the cursor is in now (−1 once all is written). */
  const cursorPart = done ? -1 : seg.ticks.findIndex((t) => t.length && n < t[t.length - 1] + PAUSE_TICKS);
  const typed = (i: number) => {
    const p = seg.parts[i];
    const t = seg.ticks[i];
    let k = 0;
    while (k < t.length && t[k] <= n) k++;
    return (
      <>
        {p.slice(0, k).join('')}
        {cursorPart === i ? (
          <span aria-hidden className="mindful-caret inline-block w-[2.5px] h-[1em] -mb-[0.12em] mx-[1px] rounded-full bg-gold-dark dark:bg-gold-light" />
        ) : null}
        {/* The rest holds its place, so nothing reflows while it is written. */}
        <span className="invisible">{p.slice(k).join('')}</span>
      </>
    );
  };

  const kicker = MINDFUL_KICKER[ctx];
  const ayah = c.quote.kind === 'ayah';

  return (
    <motion.div
      ref={screen}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={kicker}
      aria-describedby="mindful-text"
      className="fixed inset-0 z-[45] overflow-y-auto overscroll-contain outline-none bg-cream/80 dark:bg-dark-bg/85 backdrop-blur-[6px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div
        className="min-h-full w-full max-w-xl mx-auto px-7 sm:px-10 flex flex-col justify-center"
        style={{ paddingTop: 'calc(var(--safe-top) + 3rem)', paddingBottom: 'calc(var(--safe-bottom) + 2rem)' }}
      >
        <p className="flex items-center gap-2 text-[13px] font-semibold tracking-wide text-gold-dark dark:text-gold-light">
          <Feather size={15} aria-hidden />
          {kicker}
        </p>

        <div aria-hidden="true" className="mt-6">
          <p className="font-display text-[27px] sm:text-[32px] font-bold leading-tight text-teal-dark dark:text-teal-light">{typed(0)}</p>
          <p className="mt-4 text-[19px] sm:text-[21px] leading-[2] text-text-primary dark:text-text-on-dark text-pretty">{typed(1)}</p>
          <OrnamentRule className={`my-6 transition-opacity duration-700 ${n >= (seg.ticks[2][0] ?? 0) ? 'opacity-100' : 'opacity-0'}`} />
          <p
            className={[
              'text-center text-text-primary dark:text-text-on-dark text-balance',
              ayah ? 'font-quran text-[25px] sm:text-[29px] leading-[2.1]' : 'font-ornate text-[20px] sm:text-[23px] leading-[2]',
            ].join(' ')}
          >
            {typed(2)}
          </p>
          <p className={`mt-2 text-center text-[13px] text-text-muted transition-opacity duration-700 ${done ? 'opacity-100' : 'opacity-0'}`}>
            {c.quote.ref}
          </p>
        </div>

        <p id="mindful-text" className="sr-only">
          {`${c.salutation} ${c.body} ${c.quote.text} (${c.quote.ref})`}
        </p>

        <div className={`mt-10 flex flex-col items-center gap-2 transition-opacity duration-500 ${done ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <Button onClick={onClose} className="min-w-48">
            بإذن الله
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
