import { useState } from 'react';
import { CalendarClock, Check, Plus, Undo2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { NumberInput } from '@/components/ui/NumberInput';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { SectionTitle } from '@/components/ui/Ornament';
import { Field, Segmented, fieldClass } from '@/components/study/studyUi';
import { useQadaStore } from '@/store/qadaStore';
import { useSettingsStore } from '@/store/settingsStore';
import { toast, useToastStore } from '@/store/toastStore';
import { hapticsService } from '@/services/HapticsService';
import {
  PRAYER_ACC,
  PRAYER_AR,
  QADA_PRAYERS,
  dateLabelAr,
  estimateMissedDays,
  keyOf,
  nDays,
  nPrayers,
  numAr,
  prayerEta,
  prayerPlanToday,
  prayerTotals,
  type PrayerCounts,
  type PrayerDebt,
} from '@/services/qadaPlan';
import { toArabicDigits } from '@/utils/arabicFormat';
import { differenceInCalendarDays } from 'date-fns';
import type { PrayerName } from '@/types';
import { DeleteButton, FiqhNote, Quote, Stepper } from './qadaUi';

const SOURCE_AR: Record<PrayerDebt['source'], string> = {
  manual: 'أضفتها بنفسك',
  estimate: 'تقدير مدة',
  log: 'من سجل الصلاة',
  excused: '',
};

function debtLabel(d: PrayerDebt): string {
  const vals = QADA_PRAYERS.map((p) => d.counts[p] ?? 0);
  const total = vals.reduce((a, b) => a + b, 0);
  if (vals.every((v) => v === vals[0]) && vals[0] > 0) return `أيام كاملة: ${numAr(vals[0])} (${nPrayers(total)})`;
  return QADA_PRAYERS.filter((p) => d.counts[p]).map((p) => `${PRAYER_AR[p]} ${toArabicDigits(d.counts[p]!)}`).join('، ');
}

/** «الصلوات» tab: today's plan, one-tap counters per prayer, the debts list. */
export function QadaPrayers() {
  const debts = useQadaStore((s) => s.debts);
  const paid = useQadaStore((s) => s.paid);
  const perDay = useQadaStore((s) => s.settings.perDay);
  const [adding, setAdding] = useState(false);

  const now = new Date();
  const todayK = keyOf(now);
  const t = prayerTotals({ debts, paid });
  const plan = prayerPlanToday(t.remaining, paid[todayK], perDay);
  const eta = prayerEta(t.remainingTotal, plan.left, perDay, now);
  const prayerDebts = debts.filter((d): d is PrayerDebt => d.kind === 'prayer');

  const pay = (p: PrayerName) => {
    useQadaStore.getState().bump(p, 1);
    void hapticsService.notify('success');
    useToastStore.getState().push({
      kind: 'success',
      title: `قضيتَ ${PRAYER_ACC[p]}، تقبّل الله`,
      durationMs: 3200,
      action: { label: 'تراجع', onPress: () => useQadaStore.getState().bump(p, -1) },
    });
  };

  if (t.owedTotal === 0) {
    return (
      <>
        <Card className="p-2">
          <EmptyState
            title="لا صلوات فائتة مسجّلة"
            description="إن فاتتك صلوات بنوم أو نسيان أو انقطاع عن الصلاة، سجّلها هنا وتابع قضاءها مع كل فرض."
            cta={{ label: 'أضف صلوات فائتة', onClick: () => setAdding(true) }}
          />
        </Card>
        <Quote text="«مَنْ نَسِيَ صَلَاةً فَلْيُصَلِّ إِذَا ذَكَرَهَا، لَا كَفَّارَةَ لَهَا إِلَّا ذَلِكَ»" source="متفق عليه" />
        <AddPrayersSheet open={adding} onClose={() => setAdding(false)} />
      </>
    );
  }

  return (
    <>
      {/* ── The plan ───────────────────────────────── */}
      <section className="flex flex-col gap-2.5">
        <SectionTitle title="مع كل فرضٍ فرضٌ مقضيّ" subtitle="خطة يومية تمضي بها بلا عناء" />
        <Card variant="gradient-edge" className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-bold text-text-primary dark:text-text-on-dark">صلوات في اليوم</p>
              <p className="text-xs text-text-muted mt-0.5 text-pretty">
                {perDay === 5 ? 'واحدة مع كل فرض' : perDay > 5 ? 'أكثر من واحدة مع كل فرض' : 'ابدأ بما تطيق ثم زد'}
              </p>
            </div>
            <Stepper value={perDay} min={1} max={50} label="عدد صلوات القضاء في اليوم" onChange={(n) => useQadaStore.getState().setSettings({ perDay: n })} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-[var(--radius-inner)] bg-cream-dark/55 dark:bg-dark-surface px-3 py-2.5">
              <p className="text-[11px] text-text-muted">بقي من خطة اليوم</p>
              <p className="mt-0.5 font-counter tabular-nums text-lg font-bold text-teal dark:text-teal-light">
                {plan.left ? nPrayers(plan.left) : 'أتممتها، تقبّل الله'}
              </p>
            </div>
            <div className="rounded-[var(--radius-inner)] bg-cream-dark/55 dark:bg-dark-surface px-3 py-2.5">
              <p className="text-[11px] text-text-muted flex items-center gap-1">
                <CalendarClock size={12} /> تنتهي بإذن الله
              </p>
              <p className="mt-0.5 font-counter tabular-nums text-[15px] font-bold text-text-primary dark:text-text-on-dark">
                {eta ? dateLabelAr(eta) : 'أتممت القضاء'}
              </p>
              {eta && differenceInCalendarDays(eta, now) > 0 ? (
                <p className="text-[11px] text-text-muted">بعد {nDays(differenceInCalendarDays(eta, now))} بهذه الخطة</p>
              ) : null}
            </div>
          </div>
        </Card>
      </section>

      {/* ── Counters ───────────────────────────────── */}
      <section className="flex flex-col gap-2.5">
        <SectionTitle
          title="سجّل ما قضيت"
          subtitle={`بقي ${numAr(t.remainingTotal)} من ${numAr(t.owedTotal)}`}
          action={
            <Button variant="soft" size="sm" leftIcon={<Plus size={15} />} onClick={() => setAdding(true)}>
              أضف
            </Button>
          }
        />
        <Card className="p-1.5 divide-y divide-black/[0.05] dark:divide-white/[0.06]">
          {QADA_PRAYERS.filter((p) => t.owed[p] > 0).map((p) => {
            const owed = t.owed[p];
            const rem = t.remaining[p];
            const pct = Math.round((Math.min(owed, t.paid[p]) / owed) * 100);
            const doneToday = plan.done[p];
            const target = plan.target[p];
            return (
              <div key={p} className="flex items-center gap-3 px-2.5 py-3">
                <div className="relative shrink-0">
                  <ProgressRing value={pct} size={46} strokeWidth={4} showPercent={false} animate={false} />
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-counter font-bold tabular-nums text-teal dark:text-teal-light">
                    {toArabicDigits(pct)}٪
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-text-primary dark:text-text-on-dark">{PRAYER_AR[p]}</p>
                  <p className="text-[11.5px] text-text-muted font-counter tabular-nums">
                    {rem ? `بقي ${numAr(rem)} من ${numAr(owed)}` : 'تمّ قضاؤها'}
                    {target || doneToday ? ` · اليوم ${toArabicDigits(doneToday)}/${toArabicDigits(Math.max(target, doneToday))}` : ''}
                  </p>
                </div>
                {doneToday > 0 ? (
                  <button
                    type="button"
                    onClick={() => useQadaStore.getState().bump(p, -1)}
                    aria-label={`تراجع عن آخر ${PRAYER_AR[p]} مقضيّ`}
                    className="w-11 h-11 shrink-0 rounded-xl inline-flex items-center justify-center text-text-muted hover:bg-teal/10 hover:text-teal transition-colors"
                  >
                    <Undo2 size={16} />
                  </button>
                ) : null}
                {rem > 0 ? (
                  <Button variant={doneToday < target ? 'primary' : 'soft'} size="sm" className="min-h-11 shrink-0" onClick={() => pay(p)} haptic="none">
                    قضيتُ {PRAYER_ACC[p]}
                  </Button>
                ) : (
                  <span className="w-11 h-11 shrink-0 inline-flex items-center justify-center text-teal dark:text-teal-light" aria-hidden>
                    <Check size={20} strokeWidth={2.6} />
                  </span>
                )}
              </div>
            );
          })}
        </Card>
      </section>

      {/* ── What was entered ───────────────────────── */}
      <section className="flex flex-col gap-2.5">
        <SectionTitle title="ما سجّلته" subtitle="يُحسب الباقي منه بعد ما قضيت" />
        <Card className="p-1.5 divide-y divide-black/[0.05] dark:divide-white/[0.06]">
          {prayerDebts.map((d) => (
            <div key={d.id} className="flex items-center gap-3 ps-3 pe-1 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-text-primary dark:text-text-on-dark font-counter tabular-nums text-pretty">{debtLabel(d)}</p>
                <p className="text-[11px] text-text-muted">
                  {[SOURCE_AR[d.source], d.note, dateLabelAr(new Date(d.at))].filter(Boolean).join(' · ')}
                </p>
              </div>
              <DeleteButton label="حذف هذا القيد" message="يُحذف من مجموع ما عليك، ويبقى ما قضيته محسوباً." onConfirm={() => useQadaStore.getState().removeDebt(d.id)} />
            </div>
          ))}
        </Card>
      </section>

      <Quote text="«مَنْ نَسِيَ صَلَاةً فَلْيُصَلِّ إِذَا ذَكَرَهَا، لَا كَفَّارَةَ لَهَا إِلَّا ذَلِكَ»" source="متفق عليه" />
      <AddPrayersSheet open={adding} onClose={() => setAdding(false)} />
    </>
  );
}

type Mode = 'each' | 'days' | 'estimate';

/** Add owed prayers: per prayer, whole days ×5, or an estimate for someone returning to prayer. */
export function AddPrayersSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const female = useSettingsStore((s) => s.gender) === 'female';
  const [mode, setMode] = useState<Mode>('each');
  const [each, setEach] = useState<Record<PrayerName, number>>({ fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 });
  const [days, setDays] = useState(1);
  const [years, setYears] = useState(0);
  const [months, setMonths] = useState(6);
  const [excusedPerMonth, setExcusedPerMonth] = useState(0);

  const perPrayer = mode === 'days' ? days : mode === 'estimate' ? estimateMissedDays(years, months, female ? excusedPerMonth : 0) : 0;
  const counts: PrayerCounts =
    mode === 'each' ? each : Object.fromEntries(QADA_PRAYERS.map((p) => [p, perPrayer]));
  const total = QADA_PRAYERS.reduce((a, p) => a + (counts[p] ?? 0), 0);

  const save = () => {
    const clean: PrayerCounts = {};
    for (const p of QADA_PRAYERS) if ((counts[p] ?? 0) > 0) clean[p] = Math.floor(counts[p]!);
    useQadaStore.getState().addDebt({
      kind: 'prayer',
      counts: clean,
      source: mode === 'estimate' ? 'estimate' : 'manual',
      note: mode === 'estimate' ? [years ? `${toArabicDigits(years)} سنة` : '', months ? `${toArabicDigits(months)} شهر` : ''].filter(Boolean).join(' و') : undefined,
    });
    toast.success(`أُضيفت ${nPrayers(total)} إلى ما عليك`);
    setEach({ fajr: 0, dhuhr: 0, asr: 0, maghrib: 0, isha: 0 });
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="أضف صلوات فائتة">
      <div className="flex flex-col gap-4 pb-2">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'each', label: 'صلوات بعينها' },
            { value: 'days', label: 'أيام كاملة' },
            { value: 'estimate', label: 'تقدير مدة' },
          ]}
        />

        {mode === 'each' ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {QADA_PRAYERS.map((p) => (
              <Field key={p} label={PRAYER_AR[p]}>
                <NumberInput
                  value={each[p]}
                  min={0}
                  max={100000}
                  onValueChange={(n) => setEach((e) => ({ ...e, [p]: n }))}
                  className={`${fieldClass} font-counter tabular-nums`}
                  aria-label={`عدد صلوات ${PRAYER_AR[p]} الفائتة`}
                />
              </Field>
            ))}
          </div>
        ) : mode === 'days' ? (
          <Field label="عدد الأيام" hint="يوم كامل = الصلوات الخمس">
            <NumberInput value={days} min={0} max={36500} onValueChange={setDays} className={`${fieldClass} font-counter tabular-nums`} />
          </Field>
        ) : (
          <>
            <p className="text-[13px] text-text-secondary dark:text-text-on-dark/80 text-pretty">
              لمن عاد إلى الصلاة بعد انقطاع: قدّر المدة التي تركتها فيها منذ البلوغ، ونحسب لك الصلوات الخمس عن كل يوم منها.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="سنوات">
                <NumberInput value={years} min={0} max={80} onValueChange={setYears} className={`${fieldClass} font-counter tabular-nums`} />
              </Field>
              <Field label="أشهر">
                <NumberInput value={months} min={0} max={11} onValueChange={setMonths} className={`${fieldClass} font-counter tabular-nums`} />
              </Field>
            </div>
            {female ? (
              <Field label="متوسط أيام الحيض في الشهر" hint="صلاة أيام الحيض والنفاس لا تُقضى، فنطرحها من المدة">
                <NumberInput value={excusedPerMonth} min={0} max={15} onValueChange={setExcusedPerMonth} className={`${fieldClass} font-counter tabular-nums`} />
              </Field>
            ) : null}
            <FiqhNote>
              جمهور الفقهاء على وجوب قضاء ما تُرك من الصلوات، ويرى بعض أهل العلم أن من تركها عمداً مدة طويلة تكفيه التوبة الصادقة والإكثار من
              النوافل. راجع أهل العلم في حالتك.
            </FiqhNote>
          </>
        )}

        <div className="rounded-[var(--radius-inner)] bg-teal/[0.07] dark:bg-teal/15 px-3.5 py-3 text-sm text-text-primary dark:text-text-on-dark">
          {mode === 'each' ? (
            <>المجموع: <b className="font-counter tabular-nums">{nPrayers(total)}</b></>
          ) : (
            <>
              الخمس × {numAr(perPrayer)} = <b className="font-counter tabular-nums">{nPrayers(total)}</b>
            </>
          )}
        </div>

        <Button variant="primary" fullWidth disabled={total <= 0} onClick={save} leftIcon={<Plus size={16} />}>
          أضفها لما عليّ
        </Button>
      </div>
    </BottomSheet>
  );
}
