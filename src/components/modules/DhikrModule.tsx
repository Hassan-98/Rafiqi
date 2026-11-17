import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { format } from 'date-fns';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import {
  SkipForward, BookOpen, Sparkles, ArrowRight, Bell, ChevronLeft, ChevronRight,
  CheckCircle2, Hand, RotateCcw, Check, ChevronDown, Clock, Headphones,
} from 'lucide-react';
import { motion } from '@/lib/motion';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { CounterButton } from '@/components/ui/CounterButton';
import { CompletionBlessing } from '@/components/ui/CompletionBlessing';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Medallion, OrnamentRule } from '@/components/ui/Ornament';
import { CustomAzkarSheet } from '@/components/modules/CustomAzkarSheet';
import { QuickReminderSheet } from '@/components/reminders/QuickReminderSheet';
import { AdhkarPicker } from '@/components/adhkar/AdhkarPicker';
import { isItemDone, remainingMinutes, useAdhkarSets, useNowSlot } from '@/components/adhkar/adhkarSets';
import { POST_PRAYER_NAME, POST_PRAYER_ORDER, postPrayerSetId } from '@/components/adhkar/postPrayer';
import { usePrayerLogStore } from '@/store/prayerLogStore';
import { ListenPanel, StayAwake } from '@/components/adhkar/ListenPanel';
import { useAdhkarListen } from '@/components/adhkar/useAdhkarListen';
import { adhkarAudio } from '@/data/adhkarAudio';
import { useProgressStore } from '@/store/progressStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useCustomAzkarStore } from '@/store/customAzkarStore';
import { useDhikrSessionStore, freshSession } from '@/store/dhikrSessionStore';
import { logActivity } from '@/store/activityLogStore';
import { useVolumeKeyCounter } from '@/hooks/useVolumeKeyCounter';
import { hapticsService } from '@/services/HapticsService';
import { toast } from '@/store/toastStore';
import { formatTafsirHtml } from '@/utils/formatTafsir';
import { toArabicDigits } from '@/utils/arabicFormat';
import type { DhikrItem, PrayerName } from '@/types';

/** A short, timeline-friendly label for a dhikr (first few words of the text). */
function dhikrLabel(item: DhikrItem): string {
  const src = (item.arabic || item.translation || '').replace(/\s+/g, ' ').trim();
  return src.length > 42 ? `${src.slice(0, 42)}…` : src;
}

const repsLabel = (n: number) =>
  n === 1 ? 'مرة واحدة' : n === 2 ? 'مرتان' : n <= 10 ? `${toArabicDigits(n)} مرات` : `${toArabicDigits(n)} مرة`;

/**
 * الأذكار: the picker (time-aware hero + sets), and — when `?set=<id>` is in
 * the URL — the focused reader for that set, full-screen over the dock. The
 * set lives in the URL so the system back gesture returns to the picker, and
 * `/adhkar?set=morning` deep-links straight into a set.
 */
export function DhikrModule() {
  const { sets, ready } = useAdhkarSets();
  const slot = useNowSlot();
  const sessions = useDhikrSessionStore((s) => s.sessions);
  const removeSet = useCustomAzkarStore((s) => s.removeSet);

  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  // `postPrayer` alone = the adhkar of the prayer that just passed.
  const rawSelected = params.get('set');
  const selected = rawSelected === 'postPrayer' ? postPrayerSetId(slot.prayer.prayer) : rawSelected;

  const [createOpen, setCreateOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const openSet = useCallback(
    (id: string, replace = false, listen = false) => {
      const next = new URLSearchParams(params);
      next.set('set', id);
      if (listen) next.set('listen', '1');
      else next.delete('listen');
      setParams(next, { replace, state: { dhikrPushed: true } });
    },
    [params, setParams],
  );

  const closeSet = useCallback(() => {
    if ((location.state as { dhikrPushed?: boolean } | null)?.dhikrPushed) {
      navigate(-1);
      return;
    }
    const next = new URLSearchParams(params);
    next.delete('set');
    next.delete('listen');
    setParams(next, { replace: true });
  }, [location.state, navigate, params, setParams]);

  const handleDeleteSet = useCallback(
    (id: string) => {
      removeSet(id);
      void hapticsService.impact('medium');
      toast.info('تم حذف المجموعة');
    },
    [removeSet],
  );

  const activeSet = selected && ready ? sets.find((s) => s.id === selected) : undefined;
  // A prayer whose adhan hasn't come: its adhkar can be read ahead, but not
  // logged (that would log the prayer itself), and in a session of their own so
  // the real reading after the prayer starts fresh.
  const ap = activeSet?.prayer;
  const early = !!ap && ap !== slot.prayer.prayer && !slot.passed.includes(ap);
  const sessionKey = activeSet ? (early ? `${activeSet.id}:early` : activeSet.id) : '';
  const deleting = pendingDelete ? sets.find((s) => s.id === pendingDelete) : undefined;

  return (
    <>
      <AdhkarPicker
        sets={sets}
        sessions={sessions}
        slot={slot}
        onOpen={(id) => openSet(id)}
        onListen={(id) => openSet(id, false, true)}
        onCreate={() => setCreateOpen(true)}
        onDelete={setPendingDelete}
      />

      {activeSet
        ? createPortal(
            <DhikrSession
              key={sessionKey}
              setId={sessionKey}
              label={activeSet.label}
              items={activeSet.items}
              prayer={
                ap
                  ? ap === slot.prayer.prayer
                    ? slot.prayer
                    : { prayer: ap, dateKey: format(new Date(), 'yyyy-MM-dd'), early }
                  : undefined
              }
              onSwitchPrayer={(p) => openSet(postPrayerSetId(p), true)}
              autoListen={params.get('listen') === '1'}
              onBack={closeSet}
            />,
            document.body,
          )
        : null}

      <CustomAzkarSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(id) => {
          setCreateOpen(false);
          openSet(id);
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        title="حذف المجموعة"
        message={deleting ? `ستُحذف «${deleting.label}» وتقدّمها اليوم.` : undefined}
        confirmLabel="حذف"
        confirmVariant="danger"
        onConfirm={() => {
          if (pendingDelete) handleDeleteSet(pendingDelete);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  );
}

/** A single adhkar set opened for reading. Progress is persisted per set so
 *  the reader can leave and resume the same day with recited dhikrs intact. */
function DhikrSession({
  setId,
  label,
  items,
  prayer,
  onSwitchPrayer,
  autoListen = false,
  onBack,
}: {
  setId: string;
  label: string;
  items: DhikrItem[];
  /** أذكار ما بعد this prayer: finishing them marks it on the prayer log — unless `early` (adhan not in yet). */
  prayer?: { prayer: PrayerName; dateKey: string; early?: boolean };
  onSwitchPrayer?: (p: PrayerName) => void;
  /** Opened from «استمع» — start listening straight away. */
  autoListen?: boolean;
  onBack: () => void;
}) {
  // Activity/stats keep one «بعد الصلاة» set; the prayer is in the title.
  const logRef = prayer ? 'postPrayer' : setId;
  const { markModuleComplete, unmarkModuleComplete } = useProgressStore();
  const brief = useSettingsStore((s) => s.adhkarBrief);
  const setBrief = useSettingsStore((s) => s.setAdhkarBrief);
  const canBrief = setId === 'morning' || setId === 'evening';

  const raw = useDhikrSessionStore((s) => s.sessions[setId]);
  const session = useMemo(() => freshSession(raw), [raw]);
  const increment = useDhikrSessionStore((s) => s.increment);
  const setCount = useDhikrSessionStore((s) => s.setCount);
  const setSkipped = useDhikrSessionStore((s) => s.setSkipped);
  const setIndex = useDhikrSessionStore((s) => s.setIndex);
  const resetSession = useDhikrSessionStore((s) => s.reset);

  const [blessing, setBlessing] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  /** Re-open the cards after the set is complete (review mode). */
  const [reviewing, setReviewing] = useState(false);

  const { counts, skipped } = session;
  const currentIndex = Math.min(Math.max(0, session.currentIndex), Math.max(0, items.length - 1));
  const currentItem = items[currentIndex];

  const handleComplete = useCallback(
    (idx: number) => {
      const next = idx + 1;
      if (next < items.length) setIndex(setId, next);
      // Set-level completion is handled by the allDone effect below, so
      // jumping to the last card via the arrows can't short-circuit the set.
    },
    [items.length, setId, setIndex],
  );

  const handleSkip = useCallback(() => {
    if (!currentItem) return;
    setSkipped(setId, currentItem.id, true);
    void hapticsService.impact('light');
    toast.info('تم تخطي هذا الذكر');
    const next = currentIndex + 1;
    if (next < items.length) setIndex(setId, next);
  }, [currentItem, currentIndex, items.length, setId, setIndex, setSkipped]);

  const handleIncrement = useCallback(() => {
    if (!currentItem) return;
    increment(setId, currentItem.id);
    // Every count buzzes, whichever surface it came from (button, text, key) —
    // the tally is often raised without looking at the screen.
    void hapticsService.impact('light');
    logActivity({
      domain: 'dhikr',
      refId: logRef,
      subId: currentItem.id,
      title: label,
      detail: dhikrLabel(currentItem),
      amount: 1,
      unit: 'مرة',
      kind: 'progress',
    });
  }, [currentItem, increment, label, logRef, setId]);

  /** One count from anywhere but the counter button — the dhikr text itself or
   *  a volume key. Mirrors CounterButton: ignore taps once the dhikr is done,
   *  and advance to the next card on the count that fills it. */
  const countOnce = useCallback(() => {
    if (!currentItem) return;
    const cur = counts[currentItem.id] ?? 0;
    if (cur >= currentItem.count) return;
    handleIncrement();
    if (cur + 1 >= currentItem.count) {
      void hapticsService.impact('medium');
      handleComplete(currentIndex);
    }
  }, [counts, currentIndex, currentItem, handleComplete, handleIncrement]);

  const handleMarkComplete = useCallback(() => {
    if (!currentItem) return;
    const already = counts[currentItem.id] ?? 0;
    const add = Math.max(0, currentItem.count - already);
    setCount(setId, currentItem.id, currentItem.count);
    setSkipped(setId, currentItem.id, false);
    if (add > 0) {
      logActivity({
        domain: 'dhikr',
        refId: logRef,
        subId: currentItem.id,
        title: label,
        detail: dhikrLabel(currentItem),
        amount: add,
        unit: 'مرة',
        kind: 'progress',
      });
    }
    void hapticsService.impact('medium');
    handleComplete(currentIndex);
  }, [currentItem, counts, currentIndex, handleComplete, label, logRef, setCount, setId, setSkipped]);

  const goPrev = useCallback(() => {
    setIndex(setId, Math.max(0, currentIndex - 1));
    void hapticsService.impact('light');
  }, [currentIndex, setId, setIndex]);
  const goNext = useCallback(() => {
    setIndex(setId, Math.min(items.length - 1, currentIndex + 1));
    void hapticsService.impact('light');
  }, [currentIndex, items.length, setId, setIndex]);

  const handleUndoSession = useCallback(() => {
    resetSession(setId);
    unmarkModuleComplete('dhikr');
    if (prayer && !prayer.early) usePrayerLogStore.getState().setPrayer(prayer.dateKey, prayer.prayer, 'adhkar', false);
    setReviewing(false);
    void hapticsService.impact('medium');
    toast.info('تم مسح الجلسة');
  }, [prayer, resetSession, setId, unmarkModuleComplete]);

  // Counter filled → the text stops being a tap target, exactly like the
  // counter button disabling itself (a skipped-but-uncounted dhikr still counts).
  const currentFilled = !!currentItem && (counts[currentItem.id] ?? 0) >= currentItem.count;

  const completedCount = items.filter((it) => isItemDone(it, counts, skipped)).length;
  const allDone = completedCount === items.length && items.length > 0;
  const recitedCount = items.filter((it) => (counts[it.id] ?? 0) >= it.count).length;
  const showSummary = allDone && !reviewing;
  const minutesLeft = remainingMinutes(items, counts, skipped);

  const volumeKeysLive = useVolumeKeyCounter(countOnce, !!currentItem && !showSummary);

  // ── Listening mode: recite → the user repeats → countOnce → next dhikr ──
  const goTo = useCallback((i: number) => setIndex(setId, i), [setId, setIndex]);
  const listen = useAdhkarListen({ label, items, index: currentIndex, counts, skipped, countOnce, goTo });
  const setHasAudio = useMemo(() => items.some((it) => adhkarAudio(it.id)), [items]);
  // Mount-only (StrictMode's re-run is paired with the hook's unmount stop).
  useEffect(() => {
    if (autoListen) listen.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // The set finished (or its summary is showing) → nothing left to recite.
  const { stop: stopListening } = listen;
  const listening = listen.state.on;
  useEffect(() => {
    if (showSummary && listening) stopListening();
  }, [listening, showSummary, stopListening]);

  // Fire set completion exactly once, when EVERY item is recited-or-skipped —
  // and only credit the day if something was actually recited. Previously
  // (a) passing the last card marked the module done even with untouched
  // earlier items, (b) skipping every dhikr still counted as worship for
  // streaks/badges, and (c) finishing via skip never showed the blessing.
  const completionFiredRef = useRef(allDone);
  useEffect(() => {
    if (!allDone) {
      completionFiredRef.current = false;
      return;
    }
    if (completionFiredRef.current) return;
    completionFiredRef.current = true;
    const recited = items.filter((it) => (counts[it.id] ?? 0) >= it.count).length;
    if (recited > 0) {
      markModuleComplete('dhikr', 1);
      if (prayer && !prayer.early) usePrayerLogStore.getState().setPrayer(prayer.dateKey, prayer.prayer, 'adhkar', true);
      setBlessing(true);
      void hapticsService.notify('success');
    } else {
      toast.info('تخطيت جميع الأذكار — لم تُحتسب الجلسة هذه المرة');
    }
  }, [allDone, counts, items, markModuleComplete, prayer]);

  // Desktop / keyboard: Space counts, ←/→ move (RTL: ← is the next card).
  useEffect(() => {
    if (showSummary) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'SELECT') return;
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === ' ') {
        e.preventDefault();
        countOnce();
      } else if (e.key === 'ArrowLeft') goNext();
      else if (e.key === 'ArrowRight') goPrev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [countOnce, goNext, goPrev, showSummary]);

  return (
    <div
      className="fixed inset-0 lg:inset-s-22 z-40 flex flex-col bg-cream dark:bg-dark-bg"
      role="region"
      aria-label={label}
    >
      {/* ── Header: back · title · reminder · reset ───────────────────── */}
      <header className="shrink-0 px-4 pb-3" style={{ paddingTop: 'calc(var(--safe-top) + 0.75rem)' }}>
        <div className="flex items-center gap-2 lg:max-w-2xl lg:mx-auto">
          <button
            type="button"
            onClick={onBack}
            aria-label="رجوع إلى قائمة الأذكار"
            className="w-11 h-11 rounded-2xl inline-flex items-center justify-center bg-white dark:bg-dark-card ring-1 ring-black/[0.04] dark:ring-white/[0.06] text-text-secondary dark:text-text-on-dark/80 hover:text-teal transition-colors shrink-0"
          >
            <ArrowRight size={19} />
          </button>
          <div className="flex-1 min-w-0 px-1">
            <h2 className="font-display text-[17px] font-bold text-text-primary dark:text-text-on-dark truncate">{label}</h2>
            <p className="text-[11.5px] text-text-muted font-counter">
              {showSummary
                ? 'اكتملت المجموعة'
                : `الذكر ${toArabicDigits(currentIndex + 1)} من ${toArabicDigits(items.length)}`}
              {!allDone && minutesLeft > 0 ? (
                <span className="inline-flex items-center gap-1 ms-2">
                  <Clock size={11} /> بقي نحو {toArabicDigits(minutesLeft)} د
                </span>
              ) : null}
            </p>
          </div>
          {canBrief ? (
            <button
              type="button"
              onClick={() => {
                setBrief(!brief);
                setIndex(setId, 0);
                toast.info(brief ? 'الأذكار كاملة' : 'الأذكار المختصرة — تُحتسب في سلسلتك كالكاملة');
              }}
              aria-pressed={brief}
              aria-label="الأذكار المختصرة"
              className={[
                'h-11 px-3 rounded-2xl inline-flex items-center text-[12px] font-bold transition-colors shrink-0',
                brief
                  ? 'bg-gold/15 text-gold-dark dark:text-gold-light ring-1 ring-gold/30'
                  : 'bg-white dark:bg-dark-card ring-1 ring-black/[0.04] dark:ring-white/[0.06] text-text-secondary dark:text-text-on-dark/80',
              ].join(' ')}
            >
              مختصر
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setReminderOpen(true)}
            aria-label="تذكير مخصّص لهذه الأذكار"
            className="w-11 h-11 rounded-2xl inline-flex items-center justify-center bg-teal/10 dark:bg-teal/15 text-teal dark:text-teal-light hover:bg-teal/15 transition-colors shrink-0"
          >
            <Bell size={18} />
          </button>
          {completedCount > 0 ? (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              aria-label="مسح الجلسة"
              className="w-11 h-11 rounded-2xl inline-flex items-center justify-center text-text-muted hover:text-danger hover:bg-danger/10 transition-colors shrink-0"
            >
              <RotateCcw size={17} />
            </button>
          ) : null}
        </div>

        {prayer && onSwitchPrayer ? <PrayerSwitch current={prayer} onPick={onSwitchPrayer} /> : null}
        {prayer?.early ? (
          <p className="mt-2 lg:max-w-2xl lg:mx-auto text-center text-[11.5px] text-text-muted text-pretty">
            لم يُؤذَّن لل{POST_PRAYER_NAME[prayer.prayer].slice(2)} بعد، فتُقرأ الآن دون أن تُسجَّل
          </p>
        ) : null}

        {/* Segmented set progress — one bead per dhikr. */}
        <div className="mt-3 lg:max-w-2xl lg:mx-auto" aria-hidden>
          <div className="flex gap-[3px] h-1.5">
            {items.map((it, i) => {
              const isSkipped = !!skipped[it.id] && (counts[it.id] ?? 0) < it.count;
              const isRead = (counts[it.id] ?? 0) >= it.count;
              return (
                <span
                  key={it.id}
                  className={[
                    'rounded-full transition-[flex-grow,background-color] duration-300',
                    i === currentIndex && !showSummary ? 'flex-[2.5]' : 'flex-1',
                    i === currentIndex && !showSummary
                      ? 'bg-gold'
                      : isRead
                        ? 'bg-teal dark:bg-teal-light'
                        : isSkipped
                          ? 'bg-text-muted/35'
                          : 'bg-cream-dark dark:bg-dark-surface',
                  ].join(' ')}
                />
              );
            })}
          </div>
        </div>
      </header>

      {showSummary ? (
        <CompletionSummary
          label={label}
          recited={recitedCount}
          skippedCount={items.length - recitedCount}
          reps={items.reduce((n, it) => n + Math.min(it.count, counts[it.id] ?? 0), 0)}
          onReview={() => {
            setReviewing(true);
            setIndex(setId, 0);
          }}
          onBack={onBack}
        />
      ) : currentItem ? (
        <>
          <main className="flex-1 min-h-0 px-4 flex flex-col">
            <DhikrCard
              key={currentItem.id}
              item={currentItem}
              skipped={!!skipped[currentItem.id]}
              done={isItemDone(currentItem, counts, skipped)}
              onCount={currentFilled ? undefined : countOnce}
            />
          </main>

          {/* ── Counter dock: prev · ring · next, then complete / skip ── */}
          <footer
            className="shrink-0 px-4 pt-4 flex flex-col items-center gap-3"
            style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
          >
            {listen.state.on ? (
              <>
                <StayAwake />
                <ListenPanel
                  state={listen.state}
                  rep={Math.min(currentItem.count, (counts[currentItem.id] ?? 0) + 1)}
                  of={currentItem.count}
                  review={currentFilled}
                  onPause={listen.pause}
                  onResume={listen.resume}
                  onStop={listen.stop}
                />
              </>
            ) : null}
            <div className="flex items-center justify-center gap-6 w-full">
              <button
                type="button"
                onClick={goPrev}
                disabled={currentIndex === 0}
                aria-label="الذكر السابق"
                className="w-12 h-12 rounded-2xl inline-flex items-center justify-center bg-white dark:bg-dark-card ring-1 ring-black/[0.04] dark:ring-white/[0.06] text-text-secondary dark:text-text-on-dark/80 disabled:opacity-30 disabled:cursor-not-allowed hover:text-teal transition-colors"
              >
                <ChevronRight size={22} />
              </button>
              <span className="relative inline-flex rounded-full">
                {listen.state.on && listen.state.phase === 'reciting' ? (
                  <span
                    aria-hidden
                    className="absolute -inset-2 rounded-full ring-2 ring-gold/45 animate-pulse motion-reduce:animate-none"
                  />
                ) : null}
                <CounterButton
                  size={124}
                  current={counts[currentItem.id] ?? 0}
                  max={currentItem.count}
                  onIncrement={handleIncrement}
                  onComplete={() => handleComplete(currentIndex)}
                />
              </span>
              <button
                type="button"
                onClick={goNext}
                disabled={currentIndex === items.length - 1}
                aria-label="الذكر التالي"
                className="w-12 h-12 rounded-2xl inline-flex items-center justify-center bg-white dark:bg-dark-card ring-1 ring-black/[0.04] dark:ring-white/[0.06] text-text-secondary dark:text-text-on-dark/80 disabled:opacity-30 disabled:cursor-not-allowed hover:text-teal transition-colors"
              >
                <ChevronLeft size={22} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              {setHasAudio && !listen.state.on ? (
                <Button variant="gold" size="sm" leftIcon={<Headphones size={15} />} onClick={listen.start} haptic="light">
                  استماع
                </Button>
              ) : null}
              <Button variant="soft" size="sm" leftIcon={<CheckCircle2 size={15} />} onClick={handleMarkComplete} haptic="light">
                إكمال
              </Button>
              <Button variant="ghost" size="sm" leftIcon={<SkipForward size={14} />} onClick={handleSkip} haptic="light">
                تخطي
              </Button>
            </div>
            {!currentFilled && !listen.state.on ? (
              <p className="inline-flex items-center gap-1 text-[10.5px] text-text-muted">
                <Hand size={11} />
                {volumeKeysLive ? 'اضغط على الذكر أو العدّاد أو أزرار الصوت' : 'اضغط على الذكر أو العدّاد للعدّ'}
              </p>
            ) : null}
          </footer>
        </>
      ) : (
        <main className="flex-1 px-4">
          <Card className="p-8 text-center text-sm text-text-muted">لا توجد أذكار في هذه المجموعة.</Card>
        </main>
      )}

      <CompletionBlessing open={blessing} message="تقبّل الله ذكرك" detail={label} onDone={() => setBlessing(false)} />

      <QuickReminderSheet
        open={reminderOpen}
        onClose={() => setReminderOpen(false)}
        section="dhikr"
        defaultTitle={`تذكير: ${label}`}
      />

      <ConfirmDialog
        open={confirmReset}
        title="مسح تقدّم اليوم"
        message="ستبدأ هذه المجموعة من جديد، ويُلغى احتسابها لليوم."
        confirmLabel="مسح"
        confirmVariant="danger"
        onConfirm={() => {
          setConfirmReset(false);
          handleUndoSession();
        }}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}

/** «بعد أيّ صلاة؟» — the five prayers of the day, each ticked once its adhkar are said. */
function PrayerSwitch({ current, onPick }: { current: { prayer: PrayerName; dateKey: string }; onPick: (p: PrayerName) => void }) {
  const day = usePrayerLogStore((s) => s.log[current.dateKey]);
  return (
    <div className="mt-3 lg:max-w-2xl lg:mx-auto grid grid-cols-5 gap-1.5" role="tablist" aria-label="أذكار بعد أيّ صلاة">
      {POST_PRAYER_ORDER.map((p) => {
        const on = p === current.prayer;
        const said = !!day?.[p]?.adhkar;
        return (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => !on && onPick(p)}
            className={[
              'min-h-9 rounded-xl inline-flex items-center justify-center gap-1 text-[12px] font-bold transition-colors',
              on
                ? 'bg-[image:var(--gradient-teal)] text-on-accent shadow-[var(--shadow-xs)]'
                : said
                  ? 'bg-gold/15 text-gold-dark dark:text-gold-light'
                  : 'bg-white dark:bg-dark-card ring-1 ring-black/[0.05] dark:ring-white/[0.07] text-text-secondary dark:text-text-on-dark/75',
            ].join(' ')}
          >
            {said ? <Check size={12} strokeWidth={3} aria-label="قيلت" /> : null}
            {POST_PRAYER_NAME[p]}
          </button>
        );
      })}
    </div>
  );
}

/** The end of a set: blessing, what was read, and where to go next. */
function CompletionSummary({
  label,
  recited,
  skippedCount,
  reps,
  onReview,
  onBack,
}: {
  label: string;
  recited: number;
  skippedCount: number;
  reps: number;
  onReview: () => void;
  onBack: () => void;
}) {
  const credited = recited > 0;
  return (
    <main className="flex-1 min-h-0 overflow-y-auto px-4 pb-8 flex flex-col">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="my-auto lg:max-w-2xl lg:mx-auto w-full"
      >
        <Card variant="gradient-edge" className="p-6 text-center flex flex-col items-center gap-4">
          <Medallion size={84} tone="gold">
            <Check size={34} strokeWidth={2.4} className="text-gold-dark dark:text-gold-light" />
          </Medallion>
          <div className="relative">
            <p className="font-ornate text-[34px] leading-tight font-bold text-teal dark:text-teal-light">
              {credited ? 'تقبّل الله ذكرك' : 'انتهت المجموعة'}
            </p>
            <p className="mt-1 text-sm text-text-secondary dark:text-text-on-dark/75 text-pretty">
              {credited
                ? `أتممت ${label} اليوم، وحُسبت في سلسلتك`
                : 'تخطيت جميع الأذكار، فلم تُحتسب هذه المرة'}
            </p>
          </div>
          <OrnamentRule className="w-40" />
          <div className="relative grid grid-cols-3 gap-2 w-full">
            {[
              { v: recited, l: 'ذكراً مقروءاً' },
              { v: reps, l: 'تكراراً' },
              { v: skippedCount, l: 'متخطّى' },
            ].map(({ v, l }) => (
              <div key={l} className="rounded-[var(--radius-inner)] bg-white/70 dark:bg-dark-card/70 ring-1 ring-black/[0.04] dark:ring-white/[0.06] py-3">
                <p className="text-2xl font-counter font-bold tabular-nums text-text-primary dark:text-text-on-dark">{toArabicDigits(v)}</p>
                <p className="text-[11px] text-text-muted">{l}</p>
              </div>
            ))}
          </div>
          <div className="relative flex flex-col gap-2 w-full mt-1">
            <Button variant="primary" fullWidth onClick={onBack}>
              العودة إلى الأذكار
            </Button>
            <Button variant="ghost" fullWidth onClick={onReview}>
              مراجعة الأذكار
            </Button>
          </div>
        </Card>
      </motion.div>
    </main>
  );
}

/** Strip Arabic diacritics + normalize alef/hamza so we can match opener words. */
const AR_DIACRITICS = /[ً-ْٰٓ-ٟؐ-ؚۖ-ۭ]/g;
const normWord = (s: string): string =>
  s.normalize('NFC').replace(AR_DIACRITICS, '').replace(/[آأإٱٲٳ]/g, 'ا').replace(/[^ء-ي]/g, '');

/**
 * A Quranic-verse dhikr is often stored with its recitation opener — the
 * isti'ādhah (أعوذ بالله…) or basmala (بسم الله…) — prepended. Those aren't part
 * of the āyah, so we split them off to render distinctly above the verse.
 */
function splitDhikrOpener(arabic: string): { opener: string | null; body: string } {
  if (!arabic) return { opener: null, body: arabic };
  const tokens = arabic.trim().split(/\s+/);
  const n = tokens.map(normWord);

  const cut = (endIdx: number) => {
    const body = tokens.slice(endIdx + 1).join(' ').trim();
    if (!body) return { opener: null, body: arabic }; // dhikr IS the opener — keep as-is
    return { opener: tokens.slice(0, endIdx + 1).join(' '), body };
  };

  // Isti'ādhah: أعوذ بالله … الرجيم  (allow the longer "السميع العليم" form)
  if (n[0] === 'اعوذ' && n[1] && n[1].startsWith('بالله')) {
    for (let i = 1; i < Math.min(n.length, 8); i++) if (n[i] === 'الرجيم') return cut(i);
  }
  // Basmala: بسم الله الرحمن الرحيم
  if (n[0] === 'بسم' && n[1] === 'الله') {
    for (let i = 2; i < Math.min(n.length, 5); i++) if (n[i] === 'الرحيم') return cut(i);
  }
  return { opener: null, body: arabic };
}

/**
 * One dhikr, typeset: repetition badge, the text (tap anywhere on it to
 * count), and the virtue + source behind a reveal. The Arabic body goes
 * through `formatTafsirHtml` so ﷺ, quoted phrases and ﴿ ayah ﴾ citations
 * get the tafsir-sheet highlights. Short dhikrs are set large; long ones
 * (āyat al-kursī…) scroll inside the card.
 */
function DhikrCard({
  item,
  skipped,
  done,
  onCount,
}: {
  item: DhikrItem;
  skipped: boolean;
  done: boolean;
  /** Tapping the dhikr text itself counts — the whole point of the big target. */
  onCount?: () => void;
}) {
  const { opener, body } = useMemo(() => splitDhikrOpener(item.arabic ?? ''), [item.arabic]);
  const formattedArabic = useMemo(() => formatTafsirHtml(body), [body]);
  const [infoOpen, setInfoOpen] = useState(false);
  const words = body.trim().split(/\s+/).length;
  // Uthmanic Hafs sets smaller than Amiri at the same px — one step up.
  const textSize = words <= 6 ? 'text-[2.75rem] leading-[1.8]' : words <= 30 ? 'text-[1.75rem] leading-[2.05]' : 'text-[1.5rem] leading-[2.1]';
  const hasInfo = !!(item.benefit || item.source);

  // A div (not a button): the formatted Arabic renders <p> blocks, which are
  // invalid inside a button. Keyboard activation is wired up by hand instead.
  const tapProps = onCount
    ? {
        role: 'button' as const,
        tabIndex: 0,
        'aria-label': 'اضغط لزيادة عدّاد الذكر',
        onClick: onCount,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onCount();
          }
        },
      }
    : {};

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="flex-1 min-h-0 flex lg:max-w-2xl lg:mx-auto w-full"
    >
      <Card variant="gradient-edge" className="flex-1 min-h-0 flex flex-col">
        {/* Repetition + state */}
        <div className="relative shrink-0 flex items-center justify-between gap-2 px-4 pt-4">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/12 text-gold-dark dark:text-gold-light px-2.5 py-1 text-[11.5px] font-bold">
            <Sparkles size={12} /> {repsLabel(item.count)}
          </span>
          {skipped ? (
            <span className="text-[11px] font-semibold rounded-full px-2.5 py-1 bg-text-muted/12 text-text-muted">تم تخطيه</span>
          ) : done ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold rounded-full px-2.5 py-1 bg-teal/10 text-teal dark:text-teal-light">
              <Check size={12} /> مقروء
            </span>
          ) : null}
        </div>

        {/* The dhikr text IS the counter: tapping anywhere on it adds one. */}
        <div
          {...tapProps}
          className={[
            'relative flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4',
            'flex flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold/60',
            onCount ? 'cursor-pointer select-none active:bg-teal/[0.04] transition-colors' : '',
          ].join(' ')}
        >
          <div className="my-auto flex flex-col items-center gap-3 text-center">
            {item.title ? (
              <p className="font-display text-[15px] font-bold text-gold-dark dark:text-gold-light text-balance">{item.title}</p>
            ) : null}
            {opener ? (
              <div className="w-full flex flex-col items-center gap-2">
                <span className="font-quran text-[15px] text-text-muted dark:text-text-on-dark/55 leading-relaxed">{opener}</span>
                <span className="h-px w-12 bg-gold/40" />
              </div>
            ) : null}
            <div
              className={`font-quran t-rich text-text-primary dark:text-text-on-dark text-balance ${textSize}`}
              // eslint-disable-next-line react/no-danger
              dangerouslySetInnerHTML={{ __html: formattedArabic }}
            />
            <OrnamentRule className="w-28 opacity-80" />
            {item.transliteration ? <p className="text-sm text-text-muted italic">{item.transliteration}</p> : null}
            {item.translation ? <p className="text-sm text-text-secondary">{item.translation}</p> : null}
          </div>
        </div>

        {/* Virtue + source, revealed on demand so repeats stay uncluttered. */}
        {hasInfo ? (
          <div className="relative shrink-0 border-t border-black/[0.05] dark:border-white/[0.06]">
            <button
              type="button"
              onClick={() => setInfoOpen((v) => !v)}
              aria-expanded={infoOpen}
              className="w-full min-h-11 px-4 flex items-center gap-2 text-[12.5px] font-semibold text-gold-dark dark:text-gold-light"
            >
              {item.benefit ? <Sparkles size={14} /> : <BookOpen size={14} />}
              {item.benefit ? 'فضل هذا الذكر' : 'المصدر'}
              <ChevronDown
                size={15}
                className={`ms-auto transition-transform duration-200 ${infoOpen ? 'rotate-180' : ''}`}
              />
            </button>
            {infoOpen ? (
              <div className="px-4 pb-4 -mt-1 flex flex-col gap-2 max-h-40 overflow-y-auto">
                {item.benefit ? (
                  <p className="rounded-[var(--radius-inner)] bg-gold/10 ring-1 ring-gold/20 px-3 py-2.5 text-[13px] leading-relaxed text-text-primary dark:text-text-on-dark/90 text-pretty">
                    {item.benefit}
                  </p>
                ) : null}
                {item.source ? (
                  <p className="inline-flex items-center gap-1.5 text-[11.5px] text-text-muted">
                    <BookOpen size={12} className="text-teal dark:text-teal-light" /> {item.source}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>
    </motion.div>
  );
}
