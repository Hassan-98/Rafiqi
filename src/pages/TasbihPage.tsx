import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from '@/lib/motion';
import { Plus, RotateCcw, Trash2, Check, Repeat, Pin, Hand } from 'lucide-react';
import { TopAppBar } from '@/components/layout/TopAppBar';
import { StatsShortcut } from '@/components/stats/StatsShortcut';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Input } from '@/components/ui/Input';
import { Sparkle } from '@/components/ui/Sparkle';
import { CompletionBlessing } from '@/components/ui/CompletionBlessing';
import { SectionTitle, Star8 } from '@/components/ui/Ornament';
import { useTasbihStore, type TasbihCounter } from '@/store/tasbihStore';
import { useVolumeKeyCounter } from '@/hooks/useVolumeKeyCounter';
import { hapticsService } from '@/services/HapticsService';
import { toast } from '@/store/toastStore';
import { toArabicDigits } from '@/utils/arabicFormat';

/** Fire a CompletionBlessing at every multiple of this lifetime total. */
const BLESSING_EVERY = 1000;

/** Cycle targets offered as chips; anything else is «مخصّص». */
const TARGETS = [33, 99, 100] as const;

/** Stable per-counter tone (token classes only) derived from the counter id. */
const TONES = [
  'bg-teal/12 text-teal dark:text-teal-light',
  'bg-gold/15 text-gold-dark dark:text-gold-light',
  'bg-teal-dark/10 text-teal-dark dark:bg-teal-light/15 dark:text-teal-light',
  'bg-gold-dark/10 text-gold-dark dark:bg-gold-light/15 dark:text-gold-light',
] as const;

function toneFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return TONES[hash % TONES.length];
}

/** Session count → position inside the current target cycle. */
function cycleOf(session: number, target: number) {
  const t = Math.max(1, target);
  const inCycle = session % t;
  const full = session > 0 && inCycle === 0;
  return { cycles: Math.floor(session / t), inCycle: full ? t : inCycle, progress: full ? 1 : inCycle / t };
}

export function TasbihPage() {
  const counters = useTasbihStore((s) => s.counters);
  const activeId = useTasbihStore((s) => s.activeId);
  const increment = useTasbihStore((s) => s.increment);
  const setActive = useTasbihStore((s) => s.setActive);
  const resetSession = useTasbihStore((s) => s.resetSession);
  const removeCounter = useTasbihStore((s) => s.removeCounter);
  const addCounter = useTasbihStore((s) => s.addCounter);
  const setTarget = useTasbihStore((s) => s.setTarget);
  const pinnedIds = useTasbihStore((s) => s.pinnedIds);
  const togglePinStore = useTasbihStore((s) => s.togglePin);

  const active = counters.find((c) => c.id === activeId);
  const [sparkle, setSparkle] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [targetOpen, setTargetOpen] = useState(false);
  const [blessingOpen, setBlessingOpen] = useState(false);

  // Pinned favourites persist in the store (they used to be component state).
  const pinned = useMemo(() => new Set(pinnedIds), [pinnedIds]);

  // Track lifetime total to detect crossing a BLESSING_EVERY multiple.
  const lifetimeTotal = useMemo(
    () => counters.reduce((sum, c) => sum + c.totalLifetimeCount, 0),
    [counters],
  );
  const prevTotalRef = useRef(lifetimeTotal);

  // Fire the lifetime blessing when the ACTUAL store total crosses a
  // BLESSING_EVERY multiple — driven by the real lifetimeTotal (not tap-time
  // arithmetic off a stale baseline, which fired at wrong counts or skipped).
  useEffect(() => {
    if (
      lifetimeTotal > 0 &&
      Math.floor(lifetimeTotal / BLESSING_EVERY) > Math.floor(prevTotalRef.current / BLESSING_EVERY)
    ) {
      void hapticsService.notify('success');
      setBlessingOpen(true);
    }
    prevTotalRef.current = lifetimeTotal;
  }, [lifetimeTotal]);

  const sortedCounters = useMemo(() => {
    return [...counters].sort((a, b) => {
      const ap = pinned.has(a.id) ? 0 : 1;
      const bp = pinned.has(b.id) ? 0 : 1;
      return ap - bp;
    });
  }, [counters, pinned]);
  const pinnedCounters = sortedCounters.filter((c) => pinned.has(c.id));

  const togglePin = (id: string) => {
    togglePinStore(id);
    void hapticsService.selection();
  };
  const select = (id: string) => {
    setActive(id);
    void hapticsService.selection();
  };
  const remove = (id: string) => {
    if (counters.length > 1) {
      removeCounter(id);
      toast.info('تم الحذف');
    }
  };

  const handleTap = () => {
    if (!active) return;
    const nextCount = active.sessionCount + 1;
    increment();
    // (Lifetime blessing is handled by the useEffect on lifetimeTotal above.)

    // Haptic intensity follows the misbaha: a full cycle is a success tap.
    if (nextCount % Math.max(1, active.target) === 0) {
      void hapticsService.notify('success');
      setSparkle(true);
      setTimeout(() => setSparkle(false), 800);
    } else if (nextCount % 100 === 0) {
      void hapticsService.impact('heavy');
    } else if (nextCount % 33 === 0) {
      void hapticsService.impact('medium');
    } else {
      void hapticsService.impact('light');
    }
  };

  // Hardware volume keys count too (opt-in setting) — for eyes-closed tasbih.
  const volumeKeysLive = useVolumeKeyCounter(handleTap, !!active);

  const cycle = active ? cycleOf(active.sessionCount, active.target) : null;
  const isPreset = active ? (TARGETS as readonly number[]).includes(active.target) : false;

  return (
    <div className="min-h-dvh bg-cream dark:bg-dark-bg flex flex-col">
      <TopAppBar
        title="السبحة"
        showBack
        actions={
          <>
            <StatsShortcut to="/stats/dhikr" label="إحصائيات التسبيح" />
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="min-h-10 text-xs font-semibold text-teal dark:text-teal-light px-2 inline-flex items-center gap-1"
            >
              <Repeat size={14} />
              تبديل
            </button>
          </>
        }
      />

      <div className="flex-1 flex flex-col px-4 gap-6 pt-2" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 2.5rem)' }}>
        {/* Pinned counters — one tap to switch. */}
        {pinnedCounters.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4" role="group" aria-label="العدّادات المثبّتة">
            {pinnedCounters.map((c) => {
              const on = c.id === activeId;
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => select(c.id)}
                  className={[
                    'shrink-0 min-h-10 rounded-2xl px-3.5 inline-flex items-center gap-2 text-sm font-semibold ring-1 transition-colors',
                    on
                      ? 'bg-[image:var(--gradient-teal)] text-on-accent ring-transparent shadow-[var(--shadow-xs)]'
                      : 'bg-white dark:bg-dark-card text-text-secondary dark:text-text-on-dark/80 ring-black/[0.05] dark:ring-white/[0.07]',
                  ].join(' ')}
                >
                  <Pin size={12} className={on ? 'text-on-accent/80' : 'text-gold'} />
                  {c.name}
                  <span className={`font-counter text-xs ${on ? 'text-on-accent/80' : 'text-text-muted'}`}>
                    {toArabicDigits(c.sessionCount)}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        {/* ── The misbaha ─────────────────────────────────────── */}
        {active && cycle ? (
          <section className="flex flex-col items-center gap-4">
            {/* The dhikr name counts too — tapping the words you recite counts. */}
            <button
              type="button"
              onClick={handleTap}
              aria-label={`${active.name} — اضغط لزيادة العدّاد`}
              className="max-w-full rounded-2xl px-3 py-1 select-none active:bg-teal/10 transition-colors text-center"
            >
              <span className="block font-ornate text-[30px] leading-tight font-bold text-teal dark:text-teal-light truncate">
                {active.name}
              </span>
              <span className="block mt-1 text-xs text-text-muted font-counter">
                {cycle.cycles > 0 ? `الدورة ${toArabicDigits(cycle.cycles + (cycle.progress === 1 ? 0 : 1))} · ` : ''}
                الهدف {toArabicDigits(active.target)}
              </span>
            </button>

            <Misbaha
              target={active.target}
              progress={cycle.progress}
              filled={cycle.inCycle}
              count={active.sessionCount}
              sparkle={sparkle}
              onTap={handleTap}
            />

            <p className="inline-flex items-center gap-1 text-[11px] text-text-muted">
              <Hand size={11} />
              {volumeKeysLive ? 'اضغط على السبحة أو أزرار الصوت' : 'اضغط في أي مكان على السبحة'}
            </p>

            {/* Cycle target */}
            <div className="flex items-center gap-1 rounded-2xl bg-cream-dark/60 dark:bg-dark-surface p-1" role="group" aria-label="هدف الدورة">
              {TARGETS.map((t) => {
                const on = active.target === t;
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setTarget(active.id, t);
                      void hapticsService.selection();
                    }}
                    className={[
                      'min-w-14 min-h-10 rounded-xl px-3 text-sm font-counter font-semibold transition-colors',
                      on
                        ? 'bg-white dark:bg-dark-card shadow-[var(--shadow-xs)] text-teal dark:text-teal-light'
                        : 'text-text-secondary dark:text-text-on-dark/70',
                    ].join(' ')}
                  >
                    {toArabicDigits(t)}
                  </button>
                );
              })}
              <button
                type="button"
                aria-pressed={!isPreset}
                onClick={() => setTargetOpen(true)}
                className={[
                  'min-h-10 rounded-xl px-3 text-sm font-semibold transition-colors',
                  !isPreset
                    ? 'bg-white dark:bg-dark-card shadow-[var(--shadow-xs)] text-teal dark:text-teal-light font-counter'
                    : 'text-text-secondary dark:text-text-on-dark/70',
                ].join(' ')}
              >
                {!isPreset ? toArabicDigits(active.target) : 'مخصّص'}
              </button>
            </div>
          </section>
        ) : (
          <Card className="p-8 text-center text-sm text-text-muted">لا يوجد عدّاد نشط، أضف عدّاداً لتبدأ.</Card>
        )}

        {/* ── Numbers ─────────────────────────────────────────── */}
        {active && cycle ? (
          <section className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-2">
              {[
                { v: active.sessionCount, l: 'هذه الجلسة' },
                { v: cycle.cycles, l: 'دورة مكتملة' },
                { v: active.totalLifetimeCount, l: 'مجموع هذا الذكر' },
              ].map(({ v, l }) => (
                <Card key={l} className="px-2 py-3 text-center">
                  <p className="text-xl font-counter font-bold tabular-nums text-text-primary dark:text-text-on-dark">{toArabicDigits(v)}</p>
                  <p className="text-[11px] text-text-muted">{l}</p>
                </Card>
              ))}
            </div>
            <Card variant="gradient-edge" className="px-4 py-3 flex items-center gap-3">
              <Star8 size={16} className="relative text-gold shrink-0" />
              <p className="relative flex-1 text-sm text-text-secondary dark:text-text-on-dark/80">
                إجمالي تسبيحك منذ البداية
              </p>
              <p className="relative font-counter text-lg font-bold tabular-nums text-teal dark:text-teal-light">
                {toArabicDigits(lifetimeTotal)}
              </p>
            </Card>
            <Button
              variant="ghost"
              size="sm"
              className="self-center"
              leftIcon={<RotateCcw size={14} />}
              disabled={active.sessionCount === 0}
              onClick={() => {
                resetSession();
                toast.info('تم تصفير العدّاد');
              }}
            >
              تصفير الجلسة
            </Button>
          </section>
        ) : null}

        {/* ── Counters ────────────────────────────────────────── */}
        <section className="flex flex-col gap-3">
          <SectionTitle
            title="عدّاداتي"
            subtitle="ثبّت ما تكرّره كثيراً ليظهر في الأعلى"
            action={
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-teal dark:text-teal-light min-h-9 px-2"
              >
                <Plus size={14} /> جديد
              </button>
            }
          />
          <Card className="p-1.5">
            {sortedCounters.map((c, i) => (
              <CounterRow
                key={c.id}
                counter={c}
                first={i === 0}
                active={c.id === activeId}
                pinned={pinned.has(c.id)}
                canDelete={counters.length > 1}
                onSelect={() => select(c.id)}
                onTogglePin={() => togglePin(c.id)}
                onDelete={() => remove(c.id)}
              />
            ))}
          </Card>
        </section>
      </div>

      {/* Counter picker sheet */}
      <BottomSheet open={pickerOpen} onClose={() => setPickerOpen(false)} title="عدّاداتي">
        <div className="flex flex-col gap-3">
          <Card className="p-1.5">
            {sortedCounters.map((c, i) => (
              <CounterRow
                key={c.id}
                counter={c}
                first={i === 0}
                active={c.id === activeId}
                pinned={pinned.has(c.id)}
                canDelete={counters.length > 1}
                onSelect={() => {
                  setActive(c.id);
                  setPickerOpen(false);
                }}
                onTogglePin={() => togglePin(c.id)}
                onDelete={() => remove(c.id)}
              />
            ))}
          </Card>
          <Button
            variant="secondary"
            leftIcon={<Plus size={16} />}
            onClick={() => {
              setPickerOpen(false);
              setAddOpen(true);
            }}
          >
            عدّاد جديد
          </Button>
        </div>
      </BottomSheet>

      <AddCounterSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={(name, target) => {
          addCounter(name, target);
          toast.success('تمت إضافة العدّاد');
          setAddOpen(false);
        }}
      />

      {active ? (
        <TargetSheet
          open={targetOpen}
          initial={active.target}
          onClose={() => setTargetOpen(false)}
          onSave={(t) => {
            setTarget(active.id, t);
            setTargetOpen(false);
          }}
        />
      ) : null}

      {/* Lifetime milestone blessing */}
      <CompletionBlessing
        open={blessingOpen}
        message="ما شاء الله"
        detail={`بلغت ${toArabicDigits(lifetimeTotal)} تسبيحة`}
        onDone={() => setBlessingOpen(false)}
      />
    </div>
  );
}

/**
 * The digital misbaha: one bead per count of the cycle (up to 100) strung on
 * a ring around the tally, with the larger «imam» bead at the top. Longer
 * cycles fall back to a continuous arc. The whole disc is the tap target.
 */
function Misbaha({
  target,
  progress,
  filled,
  count,
  sparkle,
  onTap,
}: {
  target: number;
  progress: number;
  filled: number;
  count: number;
  sparkle: boolean;
  onTap: () => void;
}) {
  const C = 150;
  const R = 136;
  const beads = target <= 100 ? target : 0;
  // Leave a gap at the top for the imam bead.
  const gap = 0.16; // radians each side
  const beadR = beads ? Math.min(6.5, ((2 * Math.PI - 2 * gap) * R) / beads / 2 - 1) : 0;

  return (
    <motion.button
      type="button"
      onClick={onTap}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 420, damping: 24 }}
      aria-label={`عداد التسبيح: ${toArabicDigits(count)} — اضغط للزيادة`}
      className="relative w-[18.75rem] h-[18.75rem] max-w-[86vw] max-h-[86vw] rounded-full select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-4 focus-visible:ring-offset-cream dark:focus-visible:ring-offset-dark-bg"
    >
      <svg viewBox="0 0 300 300" className="absolute inset-0 w-full h-full" aria-hidden>
        {/* string */}
        <circle cx={C} cy={C} r={R} fill="none" stroke="currentColor" strokeWidth={1} className="text-gold/30" />
        {beads ? (
          Array.from({ length: beads }, (_, i) => {
            const a = -Math.PI / 2 + gap + ((2 * Math.PI - 2 * gap) * (i + 0.5)) / beads;
            const on = i < filled;
            const head = on && i === filled - 1;
            return (
              <circle
                key={i}
                cx={C + R * Math.cos(a)}
                cy={C + R * Math.sin(a)}
                r={head ? beadR + 1.4 : beadR}
                fill="currentColor"
                className={[
                  'transition-colors duration-200',
                  on ? 'text-gold' : 'text-cream-dark dark:text-dark-surface',
                ].join(' ')}
              />
            );
          })
        ) : (
          <circle
            cx={C}
            cy={C}
            r={R}
            fill="none"
            stroke="currentColor"
            strokeWidth={9}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="100"
            strokeDashoffset={100 - progress * 100}
            transform={`rotate(-90 ${C} ${C})`}
            opacity={progress === 0 ? 0 : 1}
            className="text-gold transition-[stroke-dashoffset] duration-300"
          />
        )}
        {/* imam bead + tassel */}
        <ellipse cx={C} cy={C - R} rx={7} ry={10} fill="currentColor" className="text-teal dark:text-teal-light" />
        <path d={`M${C} ${C - R + 10} v10`} stroke="currentColor" strokeWidth={2} className="text-teal dark:text-teal-light" />
      </svg>

      {/* The tally disc */}
      <span className="absolute inset-[13%] rounded-full bg-white dark:bg-dark-card shadow-[var(--shadow-lg)] ring-1 ring-black/[0.04] dark:ring-white/[0.06] flex flex-col items-center justify-center">
        <span aria-hidden className="absolute inset-3 rounded-full ring-1 ring-gold/25" />
        <span className="font-counter font-bold tabular-nums leading-none text-teal dark:text-teal-light text-[4.5rem]">
          {toArabicDigits(count)}
        </span>
        <span className="mt-2 text-xs text-text-muted font-counter">
          {toArabicDigits(filled)} من {toArabicDigits(target)}
        </span>
      </span>
      <Sparkle show={sparkle} count={12} size={10} color="var(--color-gold)" />
    </motion.button>
  );
}

/** One counter in a list: tone chip, name, numbers, pin, delete. */
function CounterRow({
  counter: c,
  first,
  active,
  pinned,
  canDelete,
  onSelect,
  onTogglePin,
  onDelete,
}: {
  counter: TasbihCounter;
  first: boolean;
  active: boolean;
  pinned: boolean;
  canDelete: boolean;
  onSelect: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={[
        'flex items-center gap-1 rounded-[var(--radius-inner)] transition-colors',
        active ? 'bg-teal/[0.07] dark:bg-teal/10' : 'hover:bg-teal/5',
        first ? '' : 'border-t border-black/[0.04] dark:border-white/[0.05]',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        className="flex-1 min-w-0 flex items-center gap-3 px-3 py-3 text-start"
      >
        <span className={`w-9 h-9 rounded-xl inline-flex items-center justify-center shrink-0 ${toneFor(c.id)}`} aria-hidden>
          {active ? <Check size={17} strokeWidth={2.6} /> : <Star8 size={15} />}
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-text-primary dark:text-text-on-dark truncate">{c.name}</span>
          <span className="block text-[11px] text-text-muted font-counter">
            {toArabicDigits(c.sessionCount)} من {toArabicDigits(c.target)} · المجموع {toArabicDigits(c.totalLifetimeCount)}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={onTogglePin}
        className={`w-10 h-10 rounded-xl inline-flex items-center justify-center shrink-0 ${pinned ? 'text-gold' : 'text-text-muted hover:text-gold'}`}
        aria-label={pinned ? `إلغاء تثبيت ${c.name}` : `تثبيت ${c.name}`}
        aria-pressed={pinned}
      >
        <Pin size={16} className={pinned ? 'fill-current' : ''} />
      </button>
      {canDelete ? (
        <button
          type="button"
          onClick={onDelete}
          className="w-10 h-10 me-1 rounded-xl inline-flex items-center justify-center text-text-muted hover:text-danger hover:bg-danger/10 shrink-0"
          aria-label={`حذف ${c.name}`}
        >
          <Trash2 size={16} />
        </button>
      ) : null}
    </div>
  );
}

function AddCounterSheet({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (name: string, target: number) => void;
}) {
  const [name, setName] = useState('');
  const [target, setTarget] = useState('33');
  const submit = () => {
    if (!name.trim()) return;
    const n = Number(target);
    onAdd(name.trim(), Number.isFinite(n) && n > 0 ? n : 33);
    setName('');
    setTarget('33');
  };
  return (
    <BottomSheet open={open} onClose={onClose} title="عدّاد جديد">
      <div className="flex flex-col gap-4">
        <Input
          label="اسم الذكر"
          placeholder="مثال: لا إله إلا الله"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          label="الهدف"
          type="number"
          inputMode="numeric"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
        />
        <Button variant="primary" fullWidth onClick={submit} disabled={!name.trim()}>
          إضافة
        </Button>
      </div>
    </BottomSheet>
  );
}

function TargetSheet({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: number;
  onClose: () => void;
  onSave: (target: number) => void;
}) {
  const [value, setValue] = useState(String(initial));
  useEffect(() => {
    if (open) setValue(String(initial));
  }, [open, initial]);
  const n = Number(value);
  const valid = Number.isFinite(n) && n >= 1 && n <= 100000;
  return (
    <BottomSheet open={open} onClose={onClose} title="هدف مخصّص">
      <div className="flex flex-col gap-4">
        <Input
          label="عدد التسبيحات في الدورة"
          type="number"
          inputMode="numeric"
          min={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button variant="primary" fullWidth disabled={!valid} onClick={() => onSave(n)}>
          حفظ
        </Button>
      </div>
    </BottomSheet>
  );
}
