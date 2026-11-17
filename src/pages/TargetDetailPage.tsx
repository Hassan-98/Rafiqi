import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router';
import { motion } from '@/lib/motion';
import { Plus, Minus, Check, Trash2, Clock, BookOpen, Flame, Pencil, Layers, Hand, ChevronDown, Eye, EyeOff } from 'lucide-react';
import { TopAppBar } from '@/components/layout/TopAppBar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { TextInput } from '@/components/ui/TextInput';
import { TargetFormModal } from '@/components/targets/TargetFormModal';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { HapticPressable } from '@/components/ui/HapticPressable';
import { ArchMotif, SectionTitle, Star8 } from '@/components/ui/Ornament';
import { OfferCard } from '@/components/home/StreakRescueCard';
import { remainingTimeAr as shortTimeLeft } from '@/components/targets/AwradPanel';
import { useRescueOffers } from '@/services/streakRescue';
import { formatNumberAr } from '@/services/statsService';
import {
  useTargetsStore,
  TARGET_UNIT_LABEL,
  TARGET_RECURRENCE_LABEL,
  QURAN_UNITS,
  RECITE_UNITS,
  carriedOf,
} from '@/store/targetsStore';
import { surahs } from '@/data/surahs';
import { useVolumeKeyCounter } from '@/hooks/useVolumeKeyCounter';
import { hapticsService } from '@/services/HapticsService';
import { toArabicDigits } from '@/utils/arabicFormat';
import { toast } from '@/store/toastStore';

function remainingTimeAr(ms: number): string {
  if (ms <= 0) return 'انتهت مدّة الوِرد';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `يتبقّى ${toArabicDigits(mins)} دقيقة`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `يتبقّى ${toArabicDigits(hours)} ساعة`;
  return `يتبقّى ${toArabicDigits(Math.round(hours / 24))} يوم`;
}

export function TargetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const target = useTargetsStore((s) => s.targets.find((t) => t.id === id));
  const addProgress = useTargetsStore((s) => s.addProgress);
  const setProgress = useTargetsStore((s) => s.setProgress);
  const setCarry = useTargetsStore((s) => s.setCarry);
  const complete = useTargetsStore((s) => s.complete);
  const removeTarget = useTargetsStore((s) => s.removeTarget);
  const [manual, setManual] = useState('');
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [carryOpen, setCarryOpen] = useState(false);
  const [carryVal, setCarryVal] = useState('');
  const [manualOpen, setManualOpen] = useState(false);
  const rescueOffers = useRescueOffers();

  // Defined before the early returns below (hooks must run unconditionally) and
  // read from the store rather than the render-time `target` so the volume-key
  // listener never counts against a stale snapshot.
  const bump = useCallback(
    (by: number) => {
      const t = useTargetsStore.getState().targets.find((x) => x.id === id);
      if (!t) return;
      const willComplete = by > 0 && t.current < t.total && t.current + by >= t.total;
      addProgress(t.id, by);
      void hapticsService.impact(willComplete ? 'heavy' : 'light');
      if (willComplete && !!t.recurrence && t.recurrence !== 'none') {
        toast.success('أتممت وِرد الفترة، وأي زيادة تُحتسب نافلة');
      } else if (willComplete) {
        toast.success('بارك الله فيك، أتممت الوِرد');
      }
    },
    [addProgress, id],
  );
  const countOnce = useCallback(() => bump(1), [bump]);
  const volumeKeysLive = useVolumeKeyCounter(countOnce, !!target && !target.completedAt);

  if (!id) return <Navigate to="/targets" replace />;
  if (!target) {
    return (
      <div className="min-h-dvh bg-cream dark:bg-dark-bg">
        <TopAppBar title="الوِرد" showBack />
        <p className="text-center text-sm text-text-muted mt-10">الوِرد غير موجود.</p>
      </div>
    );
  }

  const pct = target.total > 0 ? Math.min(100, Math.round((target.current / target.total) * 100)) : 0;
  const remaining = Math.max(0, target.total - target.current);
  const isDone = !!target.completedAt;
  const unitLabel = TARGET_UNIT_LABEL[target.unit];
  const countHint = volumeKeysLive ? 'اضغط على النص أو أزرار الصوت للعدّ' : 'اضغط على النص للعدّ';

  const isRecurring = !!target.recurrence && target.recurrence !== 'none';
  const extra = target.extra ?? 0;
  // Recurring period goal met → the bonus (نافلة) counter is open.
  const periodDone = isRecurring && target.current >= target.total;
  // Unfinished amount carried in from previous periods (total = base + carried).
  const base = target.baseTotal ?? target.total;
  const carried = carriedOf(target);

  const applyCarry = (val: number) => {
    const v = Math.max(0, Math.round(val));
    setCarry(target.id, v);
    setCarryOpen(false);
    void hapticsService.impact('medium');
    toast.success(v === 0 ? 'تم مسح المُرحَّل وعاد الوِرد إلى أصله' : 'تم تحديث المُرحَّل');
  };

  const isQuran = QURAN_UNITS.includes(target.unit);
  const isRecite = RECITE_UNITS.includes(target.unit);

  const quranScope = (() => {
    if (!isQuran) return '';
    const parts: string[] = [];
    if (target.quranSurah) {
      parts.push(surahs.find((s) => s.number === target.quranSurah)?.nameArabic ?? `سورة ${toArabicDigits(target.quranSurah)}`);
    }
    if (target.quranFrom) {
      parts.push(
        `${unitLabel} ${toArabicDigits(target.quranFrom)}${target.quranTo ? `–${toArabicDigits(target.quranTo)}` : ''}`,
      );
    }
    return parts.join(' · ');
  })();

  const goToQuran = () => {
    const { unit, quranSurah, quranFrom } = target;
    if (unit === 'ayah' && quranSurah) navigate(`/quran/read/${quranSurah}?ayah=${quranFrom ?? 1}`);
    else if (unit === 'surah' && quranSurah) navigate(`/quran/read/${quranSurah}`);
    else if (unit === 'page' && quranFrom) {
      const s = surahs.find((x) => x.pages[0] <= quranFrom && quranFrom <= x.pages[1]);
      navigate(`/quran/read/${s?.number ?? 1}?page=${quranFrom}`);
    } else navigate('/quran');
  };

  const left = target.deadline - Date.now();
  const offer = rescueOffers.find((o) => o.targetId === target.id);
  const reciteTexts = [...(target.note ? [target.note] : []), ...(isRecite ? target.items ?? [] : [])];
  const ringPct = periodDone || isDone ? 100 : pct;

  return (
    <div className="min-h-dvh bg-cream dark:bg-dark-bg">
      <TopAppBar
        title={target.title}
        subtitle={isRecurring ? `وِرد ${TARGET_RECURRENCE_LABEL[target.recurrence!]} · ${unitLabel}` : `هدف لمرّة واحدة · ${unitLabel}`}
        showBack
        actions={
          <button
            onClick={() => setEditOpen(true)}
            aria-label="تعديل الوِرد"
            className="p-2 rounded-full hover:bg-teal/10 text-teal dark:text-teal-light transition-colors min-w-10 min-h-10 inline-flex items-center justify-center"
          >
            <Pencil size={18} strokeWidth={2.4} />
          </button>
        }
      />
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="px-4 pt-3 pb-28 flex flex-col gap-5 lg:max-w-2xl lg:mx-auto"
      >
        {/* ── Status chips: time left, streak, نافلة, carried debt ── */}
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip tone="muted" Icon={Clock}>
            {isDone ? 'أتممته، تقبّل الله منك' : periodDone ? `يتجدّد بعد ${shortTimeLeft(left)}` : remainingTimeAr(left)}
          </Chip>
          {isRecurring && (target.streak ?? 0) > 0 ? (
            <Chip tone="gold" Icon={Flame}>
              سلسلة {toArabicDigits(target.streak ?? 0)}
            </Chip>
          ) : null}
          {extra > 0 ? <Chip tone="gold">نافلة +{toArabicDigits(extra)}</Chip> : null}
          {carried > 0 ? (
            <button
              type="button"
              onClick={() => {
                setCarryVal(String(carried));
                setCarryOpen(true);
              }}
              className="inline-flex items-center gap-1 min-h-8 text-[11.5px] font-semibold text-warning dark:text-gold-light bg-warning/10 hover:bg-warning/20 rounded-lg px-2.5 transition-colors"
            >
              <Layers size={12} /> الأصلي {toArabicDigits(base)} + مُرحَّل {toArabicDigits(carried)}
              <Pencil size={11} className="opacity-70" />
            </button>
          ) : null}
        </div>

        {offer ? <OfferCard offer={offer} /> : null}

        {/* ── What to recite: tap the words to count ─────────── */}
        {reciteTexts.length > 0 ? (
          <Card variant="gold-rim" className="p-1.5">
            {reciteTexts.map((text, i) => (
              <button
                key={i}
                type="button"
                onClick={isDone ? undefined : countOnce}
                disabled={isDone}
                aria-label={isDone ? undefined : 'اضغط لزيادة عدّاد الوِرد'}
                className={[
                  'w-full px-4 py-3.5 rounded-[var(--radius-inner)] text-center select-none transition-colors enabled:active:bg-teal/10 disabled:cursor-default',
                  i > 0 ? 'border-t border-black/[0.04] dark:border-white/[0.05]' : '',
                ].join(' ')}
              >
                <span className="block font-arabic text-lg leading-loose text-text-primary dark:text-text-on-dark text-balance">{text}</span>
              </button>
            ))}
            {!isDone ? (
              <p className="pb-2 inline-flex w-full items-center justify-center gap-1 text-[10.5px] text-text-muted">
                <Hand size={11} /> {countHint}
              </p>
            ) : null}
          </Card>
        ) : null}

        {isQuran ? (
          <Button variant="secondary" fullWidth leftIcon={<BookOpen size={18} />} onClick={goToQuran}>
            {quranScope ? `افتح المصحف · ${quranScope}` : 'افتح المصحف'}
          </Button>
        ) : null}

        {/* ── The counter: the one thing this screen is for ───── */}
        <Card variant="gradient-edge" className="p-5 flex flex-col items-center gap-4">
          <ArchMotif className="absolute -top-6 -start-8 w-36 text-gold opacity-15" />
          <HapticPressable
            haptic="medium"
            onClick={() => (isDone ? undefined : bump(1))}
            disabled={isDone}
            aria-label={isDone ? 'الوِرد مكتمل' : `عدّاد الوِرد: ${toArabicDigits(target.current)} من ${toArabicDigits(target.total)}، اضغط للزيادة`}
            className="relative rounded-full active:scale-[0.97] transition-transform disabled:cursor-default"
          >
            <ProgressRing
              value={ringPct}
              size={208}
              strokeWidth={12}
              showPercent={false}
              colorFrom={periodDone || isDone ? 'var(--color-gold)' : 'var(--color-teal)'}
              colorTo={periodDone || isDone ? 'var(--color-gold-light)' : 'var(--color-teal-light)'}
            />
            <span className="absolute inset-[18px] rounded-full bg-white dark:bg-dark-card shadow-[var(--shadow-md)] flex flex-col items-center justify-center gap-1">
              {isDone ? (
                <>
                  <Star8 size={34} className="text-gold" />
                  <span className="text-sm font-bold text-gold-dark dark:text-gold-light">أتممته</span>
                </>
              ) : periodDone ? (
                <>
                  <span className="text-[11px] font-bold text-gold-dark dark:text-gold-light">اكتمل · نافلة</span>
                  <span className="text-5xl font-counter font-bold tabular-nums leading-none text-gold-dark dark:text-gold-light">
                    +{toArabicDigits(extra)}
                  </span>
                  <span className="text-xs text-text-muted">{unitLabel}</span>
                </>
              ) : (
                <>
                  <span className="text-5xl font-counter font-bold tabular-nums leading-none text-teal dark:text-teal-light">
                    {toArabicDigits(target.current)}
                  </span>
                  <span className="text-xs font-semibold text-text-secondary dark:text-text-on-dark/70">
                    من {toArabicDigits(target.total)} {unitLabel}
                  </span>
                  <span className="text-[11px] font-counter text-text-muted">باقٍ {toArabicDigits(remaining)}</span>
                </>
              )}
            </span>
          </HapticPressable>

          {!isDone ? (
            <>
              <p className="relative text-[11px] text-text-muted inline-flex items-center gap-1">
                <Hand size={11} />
                {periodDone ? 'أي زيادة الآن نافلة لا تُرحَّل' : `اضغط الدائرة للعدّ${volumeKeysLive ? ' أو أزرار الصوت' : ''}`}
              </p>
              <div className="relative w-full grid grid-cols-5 gap-1.5">
                <QuickBtn label="−١" ariaLabel="إنقاص واحد" onClick={() => bump(-1)} muted />
                {[10, 33, 100].map((n) => (
                  <QuickBtn key={n} label={`+${toArabicDigits(n)}`} onClick={() => bump(n)} />
                ))}
                <QuickBtn label={<Pencil size={15} />} ariaLabel="إدخال العدد يدوياً" onClick={() => setManualOpen(true)} muted />
              </div>
              {!periodDone ? (
                <Button variant="ghost" size="sm" leftIcon={<Check size={16} />} onClick={() => setConfirmComplete(true)}>
                  تحديده كمكتمل
                </Button>
              ) : null}
            </>
          ) : null}
        </Card>

        <WirdHistory targetId={target.id} current={target.current + extra} streak={target.streak ?? 0} />

        {/* ── Manage ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" leftIcon={<Pencil size={16} />} onClick={() => setEditOpen(true)}>
            تعديل الوِرد
          </Button>
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="min-h-12 rounded-[var(--radius-btn)] inline-flex items-center justify-center gap-1.5 text-sm font-bold text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
          >
            <Trash2 size={16} /> حذف الوِرد
          </button>
        </div>
      </motion.div>

      <BottomSheet open={manualOpen} onClose={() => setManualOpen(false)} title="إدخال العدد يدوياً">
        <div className="flex flex-col gap-3">
          <p className="text-xs text-text-secondary dark:text-text-on-dark/70">
            اكتب ما أنجزته في هذه الفترة ({unitLabel})، وما زاد على {toArabicDigits(target.total)} يُحتسب نافلة.
          </p>
          <TextInput
            type="number"
            inputMode="numeric"
            value={manual}
            onValueChange={setManual}
            placeholder={`${toArabicDigits(target.current)}`}
            dir="ltr"
            className="bg-cream-dark/60 dark:bg-dark-surface text-text-primary dark:text-text-on-dark rounded-xl px-3 py-3 text-lg font-counter text-center outline-none focus:ring-2 focus:ring-teal/40"
          />
          <Button
            fullWidth
            leftIcon={<Check size={18} />}
            onClick={() => {
              const v = Number(manual);
              if (!Number.isNaN(v) && manual.trim() !== '') {
                setProgress(target.id, v);
                setManual('');
                setManualOpen(false);
                void hapticsService.impact('medium');
              }
            }}
          >
            حفظ
          </Button>
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={confirmComplete}
        title="تأكيد الإكمال"
        message={
          isRecurring
            ? 'سيُعتبر وِرد هذه الفترة مكتملاً ويُفتح عدّاد النوافل للزيادة. يتجدّد الوِرد تلقائياً عند انتهاء المدّة، والزيادة لا تُنقل للفترة التالية.'
            : 'سيُسجَّل الوِرد كمكتمل ولا يمكن التراجع عن ذلك. هل أنت متأكد؟'
        }
        confirmLabel="نعم، أتممته"
        confirmVariant="gold"
        onCancel={() => setConfirmComplete(false)}
        onConfirm={() => {
          setConfirmComplete(false);
          complete(target.id);
          void hapticsService.impact('heavy');
          toast.success(
            isRecurring
              ? 'أتممت وِرد الفترة، وأي زيادة تُحتسب نافلة'
              : 'بارك الله فيك، أتممت الوِرد',
          );
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="حذف الوِرد"
        message="سيُحذف الوِرد وكل تقدّمه نهائياً ولا يمكن استرجاعه. هل تريد المتابعة؟"
        confirmLabel="حذف"
        confirmVariant="danger"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          removeTarget(target.id);
          toast.info('تم حذف الوِرد');
          navigate('/targets');
        }}
      />

      <TargetFormModal open={editOpen} onClose={() => setEditOpen(false)} editing={target} />

      <BottomSheet open={carryOpen} onClose={() => setCarryOpen(false)} title="المُرحَّل من الفترات السابقة">
        {(() => {
          const parsed = Number(carryVal);
          const nextCarry = Number.isNaN(parsed) || carryVal.trim() === '' ? carried : Math.max(0, Math.round(parsed));
          const bump = (d: number) => setCarryVal(String(Math.max(0, nextCarry + d)));
          return (
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-2.5 text-xs text-text-secondary dark:text-text-on-dark/70 leading-relaxed">
                <Layers size={18} className="text-warning dark:text-gold-light shrink-0 mt-0.5" />
                <p>
                  هذا ما تراكم من الأوراد غير المكتملة في الفترات السابقة. يمكنك تقليله أو مسحه لتبدأ من
                  جديد، دون أن يتأثّر وِردك الأصلي ({toArabicDigits(base)} {unitLabel} لكل فترة).
                </p>
              </div>

              {/* Live preview of the resulting period goal */}
              <Card variant="plain" className="p-4 flex items-center justify-around text-center">
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-muted">المُرحَّل</span>
                  <span className="font-counter text-2xl font-bold text-warning dark:text-gold-light tabular-nums">
                    {toArabicDigits(nextCarry)}
                  </span>
                </div>
                <span className="text-text-muted text-lg">←</span>
                <div className="flex flex-col">
                  <span className="text-[11px] text-text-muted">وِرد الفترة</span>
                  <span className="font-counter text-2xl font-bold text-teal dark:text-teal-light tabular-nums">
                    {toArabicDigits(base + nextCarry)}
                  </span>
                </div>
              </Card>

              {/* Stepper */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => bump(-10)}
                  className="w-11 h-11 rounded-full inline-flex items-center justify-center bg-cream-dark/60 dark:bg-dark-surface text-text-secondary shrink-0"
                  aria-label="إنقاص ١٠"
                >
                  <Minus size={18} />
                </button>
                <TextInput
                  type="number"
                  inputMode="numeric"
                  value={carryVal}
                  onValueChange={setCarryVal}
                  placeholder={String(carried)}
                  dir="ltr"
                  className="flex-1 bg-cream-dark/60 dark:bg-dark-surface text-text-primary dark:text-text-on-dark rounded-xl px-3 py-2.5 text-base font-counter text-center outline-none focus:ring-2 focus:ring-teal/40"
                />
                <button
                  type="button"
                  onClick={() => bump(10)}
                  className="w-11 h-11 rounded-full inline-flex items-center justify-center bg-cream-dark/60 dark:bg-dark-surface text-text-secondary shrink-0"
                  aria-label="زيادة ١٠"
                >
                  <Plus size={18} />
                </button>
              </div>

              {/* Quick reductions */}
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" onClick={() => setCarryVal(String(Math.floor(carried / 2)))}>
                  اجعله النصف
                </Button>
                <Button variant="secondary" onClick={() => applyCarry(0)}>
                  مسح المُرحَّل بالكامل
                </Button>
              </div>

              <Button variant="primary" fullWidth leftIcon={<Check size={18} />} onClick={() => applyCarry(nextCarry)}>
                حفظ
              </Button>
            </div>
          );
        })()}
      </BottomSheet>
    </div>
  );
}

function Chip({ tone, Icon, children }: { tone: 'muted' | 'gold'; Icon?: typeof Clock; children: ReactNode }) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1 min-h-8 rounded-lg px-2.5 text-[11.5px] font-semibold font-counter',
        tone === 'gold'
          ? 'bg-gold/15 text-gold-dark dark:text-gold-light'
          : 'bg-white dark:bg-dark-card ring-1 ring-black/[0.04] dark:ring-white/[0.06] text-text-secondary dark:text-text-on-dark/75',
      ].join(' ')}
    >
      {Icon ? <Icon size={12} /> : null}
      {children}
    </span>
  );
}

function QuickBtn({ label, ariaLabel, onClick, muted = false }: { label: ReactNode; ariaLabel?: string; onClick: () => void; muted?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={[
        'min-h-11 rounded-xl ring-1 ring-black/[0.04] dark:ring-white/[0.06] text-sm font-counter font-bold inline-flex items-center justify-center active:scale-[0.96] transition-transform',
        muted
          ? 'bg-cream-dark/60 dark:bg-dark-surface text-text-secondary dark:text-text-on-dark/75'
          : 'bg-white dark:bg-dark-card shadow-[var(--shadow-xs)] text-teal dark:text-teal-light',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

const periodFmt = new Intl.DateTimeFormat('ar-EG', { weekday: 'short', day: 'numeric', month: 'short' });

/**
 * The wird over time, from the store's closed periods: completion rate, best
 * run and lifetime total, a grid of the last 28 periods (gold = met, faded
 * teal = partial, blank = nothing), and the detailed list on demand.
 */
function WirdHistory({
  targetId,
  current,
  streak,
}: {
  targetId: string;
  current: number;
  /** The live chain (may include a rescued gap the history can't see). */
  streak: number;
}) {
  const history = useTargetsStore((s) => s.history);
  const [showList, setShowList] = useState(false);
  /** The lifetime total stays hidden (owner: it shouldn't be in view by
   *  default) until asked for, behind a confirmation; hidden again next visit. */
  const [totalShown, setTotalShown] = useState(false);
  const [askTotal, setAskTotal] = useState(false);
  const model = useMemo(() => {
    const rows = history.filter((h) => h.targetId === targetId).sort((a, b) => b.endedAt - a.endedAt);
    let best = 0;
    let run = 0;
    for (const r of [...rows].reverse()) {
      run = r.completed ? run + 1 : 0;
      best = Math.max(best, run);
    }
    const recent = rows.slice(0, 30);
    return {
      rows,
      grid: rows.slice(0, 28).reverse(),
      rate: recent.length ? Math.round((recent.filter((r) => r.completed).length / recent.length) * 100) : 0,
      best: Math.max(best, streak),
      total: rows.reduce((n, r) => n + r.done + r.extra, 0) + current,
    };
  }, [history, targetId, current, streak]);
  if (model.rows.length === 0) return null;

  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle title="مسيرتك مع هذا الوِرد" subtitle={`آخر ${toArabicDigits(model.grid.length)} فترة`} />
      <div className="grid grid-cols-3 gap-2">
        {[
          { v: `${toArabicDigits(model.rate)}٪`, l: 'نسبة الإتمام' },
          { v: toArabicDigits(model.best), l: 'أطول سلسلة' },
        ].map((x) => (
          <Card key={x.l} className="p-3 text-center">
            <p className="text-lg font-counter font-bold tabular-nums text-text-primary dark:text-text-on-dark">{x.v}</p>
            <p className="text-[10.5px] text-text-muted truncate">{x.l}</p>
          </Card>
        ))}
        <Card className="p-0 overflow-hidden">
          <button
            type="button"
            onClick={() => (totalShown ? setTotalShown(false) : setAskTotal(true))}
            aria-label={totalShown ? 'إخفاء العدد الكلي' : 'عرض العدد الكلي'}
            className="w-full h-full min-h-[3.75rem] p-3 flex flex-col items-center justify-center text-center hover:bg-teal/5 transition-colors"
          >
            {totalShown ? (
              <p className="text-lg font-counter font-bold tabular-nums text-text-primary dark:text-text-on-dark">{formatNumberAr(model.total)}</p>
            ) : (
              <p className="h-7 inline-flex items-center gap-1 text-[12px] font-bold text-teal dark:text-teal-light">
                <Eye size={14} aria-hidden /> إظهار
              </p>
            )}
            <p className="text-[10.5px] text-text-muted truncate inline-flex items-center gap-1">
              {totalShown ? <EyeOff size={11} aria-hidden /> : null}
              العدد الكلي
            </p>
          </button>
        </Card>
      </div>
      <ConfirmDialog
        open={askTotal}
        title="عرض العدد الكلي؟"
        message="العدد الكلي لهذا الوِرد مخفيّ حتى يبقى همّك العمل نفسه، لا كثرته. هل تريد عرض مجموع ما أنجزته منذ بدأته؟"
        confirmLabel="اعرضه"
        cancelLabel="يبقى مخفياً"
        onConfirm={() => {
          setAskTotal(false);
          setTotalShown(true);
        }}
        onCancel={() => setAskTotal(false)}
      />
      <Card className="p-3.5">
        <div className="grid grid-cols-14 gap-1" role="img" aria-label={`أتممت ${toArabicDigits(model.grid.filter((r) => r.completed).length)} من آخر ${toArabicDigits(model.grid.length)} فترة`}>
          {model.grid.map((r, i) => (
            <span
              key={`${r.endedAt}-${i}`}
              title={periodFmt.format(r.endedAt)}
              className={[
                'aspect-square rounded-[5px]',
                r.completed ? 'bg-[image:var(--gradient-gold)]' : r.done > 0 ? 'bg-teal/35 dark:bg-teal-light/35' : 'bg-cream-dark/70 dark:bg-dark-surface',
              ].join(' ')}
            />
          ))}
        </div>
        <div className="mt-2.5 flex items-center justify-between text-[10.5px] text-text-muted">
          <span className="inline-flex items-center gap-2">
            <Legend className="bg-[image:var(--gradient-gold)]" label="مكتمل" />
            <Legend className="bg-teal/35 dark:bg-teal-light/35" label="جزئي" />
            <Legend className="bg-cream-dark/70 dark:bg-dark-surface" label="لم يُنجز" />
          </span>
          <button
            type="button"
            onClick={() => setShowList((v) => !v)}
            aria-expanded={showList}
            className="min-h-9 px-1 inline-flex items-center gap-0.5 font-semibold text-teal dark:text-teal-light"
          >
            {showList ? 'إخفاء التفاصيل' : 'التفاصيل'}
            <ChevronDown size={14} className={`transition-transform duration-200 ${showList ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </Card>
      {showList ? (
        <Card className="p-1.5">
          {model.rows.slice(0, 14).map((r, i) => (
            <div
              key={`${r.endedAt}-${i}`}
              className={['flex items-center gap-3 px-3 py-2.5', i > 0 ? 'border-t border-black/[0.04] dark:border-white/[0.05]' : ''].join(' ')}
            >
              <span
                className={[
                  'w-8 h-8 rounded-xl inline-flex items-center justify-center shrink-0',
                  r.completed ? 'bg-gold/15 text-gold-dark dark:text-gold-light' : 'bg-cream-dark/60 dark:bg-dark-surface text-text-muted',
                ].join(' ')}
              >
                {r.completed ? <Check size={15} strokeWidth={3} /> : <Minus size={14} />}
              </span>
              <span className="flex-1 min-w-0 flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-text-primary dark:text-text-on-dark">{periodFmt.format(r.endedAt)}</span>
                <span className="font-counter tabular-nums text-text-muted">
                  {toArabicDigits(r.done)} من {toArabicDigits(r.goal)}
                  {r.extra > 0 ? ` · +${toArabicDigits(r.extra)}` : ''}
                </span>
              </span>
            </div>
          ))}
        </Card>
      ) : null}
    </section>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`w-2.5 h-2.5 rounded-[3px] ${className}`} aria-hidden />
      {label}
    </span>
  );
}
