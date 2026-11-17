import { useState, useMemo, useEffect } from 'react';
import { format } from 'date-fns';
import { arSA } from 'date-fns/locale';
import { motion } from '@/lib/motion';
import {
  Plus,
  Trash2,
  Pencil,
  HandCoins,
  HeartHandshake,
  Target,
  PieChart,
  ScrollText,
  Building2,
  Baby,
  HandHeart,
  Sprout,
  Check,
} from 'lucide-react';
import { TopAppBar } from '@/components/layout/TopAppBar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { Section } from '@/components/ui/Section';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Medallion, ArchMotif } from '@/components/ui/Ornament';
import { Sparkline } from '@/components/stats/Sparkline';
import { DonutChart, type DonutSlice } from '@/components/stats/DonutChart';
import { DistributionBars, type DistributionItem } from '@/components/stats/DistributionBars';
import { useSadaqahStore, type SadaqahEntry } from '@/store/sadaqahStore';
import { toast } from '@/store/toastStore';
import { hapticsService } from '@/services/HapticsService';
import { toArabicDigits } from '@/utils/arabicFormat';

/** Rotating slice palette for cause breakdowns (design-token colours only). */
const CAUSE_COLORS = [
  'var(--color-teal)',
  'var(--color-gold)',
  'var(--color-teal-light)',
  'var(--color-gold-dark)',
] as const;

/** Quick-pick cause templates surfaced as chips when logging a sadaqah. */
const CAUSE_TEMPLATES = [
  { label: 'مسجد', icon: Building2 },
  { label: 'يتيم', icon: Baby },
  { label: 'فقير', icon: HandHeart },
  { label: 'صدقة جارية', icon: Sprout },
] as const;

/** Legacy loose localStorage key — migrated into the store on first visit. */
const GOAL_STORAGE_KEY = 'myzikr:sadaqah:monthlyGoal';

/** Format a numeric amount with Arabic-Indic digits and grouping. */
function formatAmount(n: number): string {
  return toArabicDigits(Math.round(n).toLocaleString('en-US'));
}

export function SadaqahPage() {
  const entries = useSadaqahStore((s) => s.entries);
  const add = useSadaqahStore((s) => s.add);
  const update = useSadaqahStore((s) => s.update);
  const remove = useSadaqahStore((s) => s.remove);
  const totalForMonth = useSadaqahStore((s) => s.totalForMonth);
  const totalForYear = useSadaqahStore((s) => s.totalForYear);

  const goalCfg = useSadaqahStore((s) => s.monthlyGoal);
  const setMonthlyGoal = useSadaqahStore((s) => s.setMonthlyGoal);

  const [editing, setEditing] = useState<SadaqahEntry | null>(null);
  const [open, setOpen] = useState(false);
  const [toDelete, setToDelete] = useState<SadaqahEntry | null>(null);
  const [goalOpen, setGoalOpen] = useState(false);

  // Primary currency = the one most recently used (entries are newest-first).
  const primaryCurrency = entries[0]?.currency ?? 'ر.س';

  // One-time migration of the legacy loose-key goal into the store (so it
  // survives backup/restore like everything else).
  useEffect(() => {
    if (goalCfg) return;
    try {
      const raw = localStorage.getItem(GOAL_STORAGE_KEY);
      const n = raw ? Number(raw) : 0;
      if (Number.isFinite(n) && n > 0) {
        setMonthlyGoal({ amount: n, currency: primaryCurrency });
      }
      if (raw) localStorage.removeItem(GOAL_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goal = goalCfg?.amount ?? 0;
  const goalCurrency = goalCfg?.currency ?? primaryCurrency;

  const today = new Date();
  // Goal progress counts ONLY entries in the goal's currency; the year tile
  // shows the primary currency. Mixed-currency sums are never displayed.
  const monthTotal = totalForMonth(today.getFullYear(), today.getMonth() + 1, goalCurrency);
  const yearTotal = totalForYear(today.getFullYear(), primaryCurrency);

  // Lifetime total per currency (amounts may mix currencies; never blindly add them).
  const lifetimeByCurrency = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of entries) {
      map.set(e.currency, (map.get(e.currency) ?? 0) + e.amount);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [entries]);

  // This-month total per currency.
  const monthByCurrency = useMemo(() => {
    const y = today.getFullYear();
    const m = today.getMonth() + 1;
    const map = new Map<string, number>();
    for (const e of entries) {
      const d = new Date(e.date);
      if (d.getFullYear() === y && d.getMonth() + 1 === m) {
        map.set(e.currency, (map.get(e.currency) ?? 0) + e.amount);
      }
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  // 30-day cumulative giving in the primary currency (for the hero sparkline).
  const cumulativeSpark = useMemo(() => {
    const days = 30;
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1));
    const perDay = new Array<number>(days).fill(0);
    for (const e of entries) {
      if (e.currency !== primaryCurrency) continue;
      const d = new Date(e.date);
      const idx = Math.floor((d.getTime() - start.getTime()) / 86_400_000);
      if (idx >= 0 && idx < days) perDay[idx] += e.amount;
    }
    let running = 0;
    return perDay.map((v) => (running += v));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, primaryCurrency]);

  // Cause breakdown by amount (primary currency) → donut slices.
  const causeSlices = useMemo<DonutSlice[]>(() => {
    const map = new Map<string, number>();
    for (const e of entries) {
      if (e.currency !== primaryCurrency) continue;
      map.set(e.cause, (map.get(e.cause) ?? 0) + e.amount);
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label, value], i) => ({
        label,
        value,
        color: CAUSE_COLORS[i % CAUSE_COLORS.length],
      }));
  }, [entries, primaryCurrency]);

  // Frequency of giving per cause (count of entries) → distribution bars.
  const causeFrequency = useMemo<DistributionItem[]>(() => {
    const map = new Map<string, number>();
    for (const e of entries) {
      map.set(e.cause, (map.get(e.cause) ?? 0) + 1);
    }
    return [...map.entries()].map(([label, value], i) => ({
      label,
      value,
      color: CAUSE_COLORS[i % CAUSE_COLORS.length],
    }));
  }, [entries]);

  const goalPct = goal > 0 ? Math.min(100, Math.round((monthTotal / goal) * 100)) : 0;
  const goalMet = goal > 0 && monthTotal >= goal;

  const handleSubmit = (data: Omit<SadaqahEntry, 'id' | 'createdAt'>) => {
    if (editing) {
      update(editing.id, data);
      toast.success('تم التحديث');
    } else {
      add(data);
      toast.success('تم تسجيل الصدقة');
    }
    void hapticsService.notify('success');
    setOpen(false);
    setEditing(null);
  };

  const saveGoal = (next: number) => {
    setMonthlyGoal(next > 0 ? { amount: next, currency: primaryCurrency } : null);
    void hapticsService.notify('success');
    setGoalOpen(false);
    toast.success('تم حفظ الهدف الشهري');
  };

  return (
    <div className="min-h-dvh bg-cream dark:bg-dark-bg">
      <TopAppBar
        title="سجل الصدقات"
        subtitle="«ما نقصت صدقة من مال»"
        showBack
        actions={
          <Button
            variant="icon"
            haptic="light"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
            aria-label="إضافة"
          >
            <Plus size={18} />
          </Button>
        }
      />
      <div className="px-4 pt-4 pb-28 flex flex-col gap-6">
        {/* ── Ornamented hero ──────────────────────────────────────────── */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <Card variant="gradient-edge" className="p-5">
            <ArchMotif className="absolute -top-6 -end-4 w-28 text-gold opacity-20" />
            <div className="flex items-center gap-4">
              <Medallion size={60} tone="gold">
                <HandCoins size={22} className="text-gold-dark dark:text-gold-light" />
              </Medallion>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-text-muted">إجمالي الصدقات</p>
                {lifetimeByCurrency.length === 0 ? (
                  <p className="text-3xl font-display font-bold text-teal dark:text-teal-light tabular-nums mt-0.5">
                    {toArabicDigits(0)}
                    <span className="text-base font-normal text-text-muted"> {primaryCurrency}</span>
                  </p>
                ) : (
                  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 mt-0.5">
                    {lifetimeByCurrency.map(([cur, total]) => (
                      <p
                        key={cur}
                        className="text-3xl font-display font-bold text-teal dark:text-teal-light tabular-nums"
                      >
                        {formatAmount(total)}
                        <span className="text-sm font-normal text-text-muted"> {cur}</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* This-month totals per currency */}
            <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-secondary dark:text-text-on-dark/80">
              <span className="inline-flex items-center gap-1 text-text-muted">
                <HeartHandshake size={13} className="text-gold-dark dark:text-gold-light" />
                هذا الشهر
              </span>
              {monthByCurrency.length === 0 ? (
                <span className="font-counter">
                  {toArabicDigits(0)} {primaryCurrency}
                </span>
              ) : (
                monthByCurrency.map(([cur, total]) => (
                  <span key={cur} className="font-counter font-semibold">
                    {formatAmount(total)} {cur}
                  </span>
                ))
              )}
            </div>

            {/* 30-day cumulative sparkline */}
            <div className="mt-3 pt-3 border-t border-teal/10 dark:border-dark-border flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] text-text-muted">آخر ٣٠ يومًا</p>
                <p className="text-[11px] text-text-secondary dark:text-text-on-dark/80 mt-0.5">
                  تراكمي بعملة {primaryCurrency}
                </p>
              </div>
              <Sparkline
                points={cumulativeSpark}
                color="var(--color-teal)"
                width={140}
                height={40}
                fill
                strokeWidth={2}
              />
            </div>
            {entries.length > 0 ? (
            <Button
              variant="primary"
              fullWidth
              className="mt-4"
              leftIcon={<Plus size={16} />}
              haptic="medium"
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
              سجّل صدقة
            </Button>
            ) : null}
          </Card>
        </motion.div>

        {/* ── Year + currency-aware quick stats ────────────────────────── */}
        <div className="grid grid-cols-2 gap-2">
          <Card variant="plain" className="p-3.5 text-center">
            <p className="text-[11px] text-text-muted">هذا العام</p>
            <p className="text-xl font-counter font-bold text-teal dark:text-teal-light mt-1">
              {formatAmount(yearTotal)}
              <span className="text-xs font-normal text-text-muted"> {primaryCurrency}</span>
            </p>
          </Card>
          <Card variant="plain" className="p-3.5 text-center">
            <p className="text-[11px] text-text-muted">عدد الصدقات</p>
            <p className="text-xl font-counter font-bold text-gold-dark dark:text-gold-light mt-1">
              {toArabicDigits(entries.length)}
            </p>
          </Card>
        </div>

        {/* ── Monthly goal with progress bar ───────────────────────────── */}
        <Card variant={goalMet ? 'gold-rim' : 'plain'} className="p-4" pressable onClick={() => setGoalOpen(true)}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-teal dark:text-teal-light">
              <Target size={16} />
              <span className="text-xs font-bold">الهدف الشهري</span>
            </div>
            {goalMet ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-success bg-success/12 rounded-full px-2 py-0.5">
                <Check size={11} />
                تحقّق
              </span>
            ) : (
              <span className="text-[11px] text-text-muted">{goal > 0 ? `${toArabicDigits(goalPct)}٪` : 'تعيين'}</span>
            )}
          </div>

          {goal > 0 ? (
            <>
              <div className="mt-3 h-2.5 rounded-full bg-cream-dark/70 dark:bg-dark-surface overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: goalMet ? 'var(--color-gold)' : 'var(--color-teal)' }}
                  initial={{ width: 0 }}
                  animate={{ width: `${goalPct}%` }}
                  transition={{ duration: 0.7, ease: 'easeOut' }}
                />
              </div>
              <p className="mt-2 text-[11px] text-text-secondary dark:text-text-on-dark/80 font-counter">
                {formatAmount(monthTotal)} من {formatAmount(goal)} {goalCurrency}
              </p>
            </>
          ) : (
            <p className="mt-2 text-[11px] text-text-muted">
              حدّد هدفًا شهريًا لصدقاتك وتابع تقدّمك نحوه.
            </p>
          )}
        </Card>

        {entries.length === 0 ? (
          <EmptyState
            title="لا توجد صدقات مسجلة"
            description="سجِّل صدقاتك لتتبعها — «ما نقصت صدقة من مال»"
            cta={{
              label: 'تسجيل أول صدقة',
              onClick: () => {
                setEditing(null);
                setOpen(true);
              },
            }}
          />
        ) : (
          <>
            {/* ── Cause breakdown (amount) + frequency ───────────────────── */}
            {causeSlices.length > 0 ? (
              <Section title="توزيع الصدقات" icon={<PieChart size={14} />}>
                <Card variant="plain" className="p-4">
                  <DonutChart
                    slices={causeSlices}
                    size={172}
                    thickness={24}
                    centerLabel={
                      <>
                        <span className="text-[10px] text-text-muted">حسب الجهة</span>
                        <span className="text-lg font-bold font-counter text-teal dark:text-teal-light">
                          {toArabicDigits(causeSlices.length)}
                        </span>
                        <span className="text-[10px] text-text-muted">جهة</span>
                      </>
                    }
                  />
                </Card>

                <Card variant="plain" className="p-4">
                  <p className="text-[11px] text-text-muted mb-3">عدد مرات العطاء لكل جهة</p>
                  <DistributionBars items={causeFrequency} formatValue={(v) => toArabicDigits(v)} />
                </Card>
              </Section>
            ) : null}

            {/* ── Ledger (newest first) ──────────────────────────────────── */}
            <Section title="السجل" icon={<ScrollText size={14} />}>
              <Card className="p-1.5 divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                {entries.map((e, i) => (
                  <motion.div
                    key={e.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.03, 0.3) }}
                  >
                    <div className="px-2 py-2.5 flex items-center gap-2">
                      <span className="w-10 h-10 rounded-xl bg-teal/10 text-teal dark:text-teal-light inline-flex items-center justify-center shrink-0">
                        <HandHeart size={18} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-text-primary dark:text-text-on-dark truncate">
                          {e.cause}
                        </p>
                        <p className="text-[11px] text-text-muted font-counter">
                          {formatAmount(e.amount)} {e.currency}،{' '}
                          {toArabicDigits(format(new Date(e.date), 'd MMMM yyyy', { locale: arSA }))}
                        </p>
                        {e.notes ? (
                          <p className="text-[11px] text-text-secondary dark:text-text-on-dark/70 truncate mt-0.5">
                            {e.notes}
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(e);
                          setOpen(true);
                        }}
                        className="w-10 h-10 rounded-xl inline-flex items-center justify-center text-text-muted hover:bg-teal/10 hover:text-teal"
                        aria-label="تعديل"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setToDelete(e)}
                        className="w-10 h-10 rounded-xl inline-flex items-center justify-center text-text-muted hover:bg-danger/10 hover:text-danger"
                        aria-label="حذف"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </Card>
            </Section>
          </>
        )}
      </div>

      <SadaqahForm
        open={open}
        initial={editing}
        onClose={() => {
          setOpen(false);
          setEditing(null);
        }}
        onSubmit={handleSubmit}
      />

      <ConfirmDialog
        open={!!toDelete}
        title="حذف الصدقة"
        message={toDelete ? `ستُحذف صدقة «${toDelete.cause}» من السجل.` : undefined}
        confirmLabel="حذف"
        confirmVariant="danger"
        onConfirm={() => {
          if (toDelete) {
            remove(toDelete.id);
            toast.info('تم الحذف');
          }
          setToDelete(null);
        }}
        onCancel={() => setToDelete(null)}
      />

      <GoalSheet
        open={goalOpen}
        initial={goal}
        currency={goalCfg ? goalCurrency : primaryCurrency}
        onClose={() => setGoalOpen(false)}
        onSave={saveGoal}
      />
    </div>
  );
}

function SadaqahForm({
  open,
  initial,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initial: SadaqahEntry | null;
  onClose: () => void;
  onSubmit: (data: Omit<SadaqahEntry, 'id' | 'createdAt'>) => void;
}) {
  const [amount, setAmount] = useState(initial?.amount.toString() ?? '');
  const [currency, setCurrency] = useState(initial?.currency ?? 'ر.س');
  const [cause, setCause] = useState(initial?.cause ?? '');
  const [date, setDate] = useState(initial?.date ?? format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState(initial?.notes ?? '');

  // Re-seed the form when the sheet is (re)opened for a different entry.
  useEffect(() => {
    if (!open) return;
    setAmount(initial?.amount.toString() ?? '');
    setCurrency(initial?.currency ?? 'ر.س');
    setCause(initial?.cause ?? '');
    setDate(initial?.date ?? format(new Date(), 'yyyy-MM-dd'));
    setNotes(initial?.notes ?? '');
  }, [open, initial]);

  const submit = () => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0 || !cause.trim()) return;
    onSubmit({
      amount: n,
      currency: currency.trim() || 'ر.س',
      cause: cause.trim(),
      date,
      notes: notes.trim() || undefined,
    });
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={initial ? 'تعديل الصدقة' : 'صدقة جديدة'}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <Input label="المبلغ" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <Input label="العملة" value={currency} onChange={(e) => setCurrency(e.target.value)} />
        </div>

        <Input
          label="الجهة / السبب"
          placeholder="مثال: الفقراء، المسجد، الأيتام"
          value={cause}
          onChange={(e) => setCause(e.target.value)}
        />

        {/* Category template chips */}
        <div className="flex flex-wrap gap-1.5">
          {CAUSE_TEMPLATES.map(({ label, icon: Icon }) => {
            const active = cause.trim() === label;
            return (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setCause(label);
                  void hapticsService.impact('light');
                }}
                className={[
                  'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                  active
                    ? 'bg-teal text-on-accent dark:text-dark-bg'
                    : 'bg-teal/10 text-teal dark:text-teal-light hover:bg-teal/20',
                ].join(' ')}
              >
                <Icon size={11} />
                {label}
              </button>
            );
          })}
        </div>

        <Input label="التاريخ" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <Input label="ملاحظات (اختياري)" value={notes} onChange={(e) => setNotes(e.target.value)} />

        <Button variant="primary" fullWidth onClick={submit} disabled={!amount || !cause.trim()}>
          {initial ? 'حفظ التغييرات' : 'تسجيل الصدقة'}
        </Button>
      </div>
    </BottomSheet>
  );
}

function GoalSheet({
  open,
  initial,
  currency,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: number;
  currency: string;
  onClose: () => void;
  onSave: (n: number) => void;
}) {
  const [value, setValue] = useState(initial ? String(initial) : '');

  useEffect(() => {
    if (open) setValue(initial ? String(initial) : '');
  }, [open, initial]);

  const save = () => {
    const n = Number(value);
    onSave(Number.isFinite(n) && n > 0 ? n : 0);
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="الهدف الشهري">
      <div className="flex flex-col gap-3">
        <p className="text-xs text-text-secondary dark:text-text-on-dark/80 leading-relaxed">
          حدّد مبلغًا تطمح للتصدّق به كل شهر بعملة {currency}. اتركه فارغًا لإلغاء الهدف.
        </p>
        <Input
          label={`المبلغ الشهري (${currency})`}
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button variant="primary" fullWidth onClick={save}>
          حفظ الهدف
        </Button>
      </div>
    </BottomSheet>
  );
}
