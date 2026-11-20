import { useState } from 'react';
import { CalendarPlus, Check, Moon, Plus, Undo2, X } from 'lucide-react';
import { addDays } from 'date-fns';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { NumberInput } from '@/components/ui/NumberInput';
import { ArchMotif, Medallion, SectionTitle } from '@/components/ui/Ornament';
import { Field, Pill, Segmented, fieldClass } from '@/components/study/studyUi';
import { setQadaFast, useQadaStore } from '@/store/qadaStore';
import { useCalendarPrefs } from '@/services/calendarEvents';
import { toast } from '@/store/toastStore';
import { hapticsService } from '@/services/HapticsService';
import { hijriMonthLength, hijriMonthStart, toHijri } from '@/services/HijriService';
import {
  BLOCKED_AR,
  FAST_DAY_KIND_AR,
  FAST_REASONS,
  FAST_REASON_AR,
  blockedReason,
  currentFastPlan,
  dateLabelAr,
  dateOf,
  dayLabelAr,
  hijriLabelAr,
  keyOf,
  lastRamadanYear,
  nDays,
  type FastDebt,
  type FastReason,
} from '@/services/qadaPlan';
import { toArabicDigits } from '@/utils/arabicFormat';
import { DeleteButton, FiqhNote, PillGroup, Quote, dateInputClass } from './qadaUi';

const SHOWN = 6;

/** «الصيام» tab: the Ramadan deadline, today's qada fast, the proposed days and the debts. */
export function QadaFasts() {
  const debts = useQadaStore((s) => s.debts);
  const paid = useQadaStore((s) => s.paid);
  const offset = useCalendarPrefs((s) => s.hijriOffset);
  const [adding, setAdding] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [pastDay, setPastDay] = useState('');

  const now = new Date();
  const todayK = keyOf(now);
  const tomorrowK = keyOf(addDays(now, 1));
  const { status, days, shortfall, blocked } = currentFastPlan({ debts, paid }, now, offset);
  const fastDebts = debts.filter((d): d is FastDebt => d.kind === 'fast').sort((a, b) => b.year - a.year || b.at - a.at);
  const todayPaid = (paid[todayK]?.fast ?? 0) > 0;
  const todayBlocked = blockedReason(now, offset);
  const ramadanYear = toHijri(status.nextRamadan, offset).year;
  const overdueYears = new Set(status.byYear.filter((y) => y.overdue).map((y) => y.year));

  const markToday = () => {
    setQadaFast(todayK, true, true);
    void hapticsService.notify('success');
    toast.success('تقبّل الله صيامك', 'سُجّل اليوم قضاءً');
  };

  const markPast = () => {
    if (!pastDay) return;
    const why = blockedReason(dateOf(pastDay), offset);
    if (why) {
      toast.warning(BLOCKED_AR[why]);
      return;
    }
    if ((paid[pastDay]?.fast ?? 0) > 0) {
      toast.info('هذا اليوم مسجّل قضاءً من قبل');
      return;
    }
    setQadaFast(pastDay, true, true);
    toast.success('تقبّل الله', `سُجّل ${dayLabelAr(dateOf(pastDay))} قضاءً`);
    setPastDay('');
  };

  if (status.owed === 0) {
    return (
      <>
        <Card className="p-2">
          <EmptyState
            title="لا أيام صيام عليك مسجّلة"
            description="إن أفطرت أياماً من رمضان لسفر أو مرض أو عذر، سجّلها هنا ونقترح لك أياماً تقضيها فيها قبل رمضان القادم."
            cta={{ label: 'أضف أيام صيام', onClick: () => setAdding(true) }}
          />
        </Card>
        <Quote text="﴿فَمَن كَانَ مِنكُم مَّرِيضًا أَوْ عَلَىٰ سَفَرٍ فَعِدَّةٌ مِّنْ أَيَّامٍ أُخَرَ﴾" source="البقرة: ١٨٤" />
        <AddFastsSheet open={adding} onClose={() => setAdding(false)} />
      </>
    );
  }

  const pct = status.owed ? Math.round((status.paid / status.owed) * 100) : 0;

  return (
    <>
      {/* ── Deadline ───────────────────────────────── */}
      <Card variant="gradient-edge" className="p-5">
        <ArchMotif className="absolute -top-6 -end-4 w-28 text-gold opacity-20" />
        <div className="relative flex items-center gap-4">
          <Medallion size={76} tone="gold">
            <span className="text-lg text-gold-dark dark:text-gold-light tabular-nums">{toArabicDigits(status.daysToRamadan)}</span>
          </Medallion>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-text-muted">قبل دخول رمضان القادم</p>
            <p className="font-display text-xl font-bold text-text-primary dark:text-text-on-dark mt-0.5 text-balance">
              بقي {nDays(status.daysToRamadan)} على رمضان
            </p>
            <p className="text-xs text-text-muted mt-0.5 font-counter tabular-nums">
              ١ رمضان {toArabicDigits(ramadanYear)} · {dateLabelAr(status.nextRamadan)}
            </p>
          </div>
        </div>

        <div className="relative mt-4">
          <div className="flex items-baseline justify-between text-xs text-text-secondary dark:text-text-on-dark/80">
            <span>
              قضيتَ <b className="font-counter tabular-nums">{toArabicDigits(status.paid)}</b> من {toArabicDigits(status.owed)}
            </span>
            <span className="font-bold text-teal dark:text-teal-light">{status.remaining ? `بقي ${nDays(status.remaining)}` : 'أتممتها'}</span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-cream-dark/70 dark:bg-white/[0.06] overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="ما قضيت من الصيام">
            <div className="h-full rounded-full bg-[image:var(--gradient-teal)] transition-[width] duration-300 ease-out-soft" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="relative mt-4">
          {todayPaid ? (
            <div className="flex items-center gap-2">
              <span className="flex-1 inline-flex items-center gap-2 rounded-xl bg-teal/10 px-3 min-h-11 text-sm font-bold text-teal dark:text-teal-light">
                <Check size={16} strokeWidth={2.6} /> صمتَ اليوم قضاءً، تقبّل الله
              </span>
              <Button variant="ghost" size="sm" className="min-h-11" leftIcon={<Undo2 size={15} />} onClick={() => setQadaFast(todayK, false, false)}>
                تراجع
              </Button>
            </div>
          ) : todayBlocked ? (
            <p className="text-xs text-text-muted text-center">اليوم {BLOCKED_AR[todayBlocked]}</p>
          ) : status.remaining > 0 ? (
            <Button variant="primary" fullWidth leftIcon={<Moon size={16} />} onClick={markToday} haptic="none">
              صمتُ اليوم قضاءً
            </Button>
          ) : null}
        </div>
      </Card>

      {status.overdue > 0 ? (
        <FiqhNote>
          <b className="text-text-primary dark:text-text-on-dark">دخل رمضان على {nDays(status.overdue)} لم تُقضَ بعد.</b> اقضها في أقرب وقت. ومن أخّر القضاء
          حتى دخل رمضان آخر بلا عذر فعليه التوبة مع القضاء، وأوجب جمهور الفقهاء معه إطعام مسكين عن كل يوم، ولم يوجبه الحنفية؛ ومن أخّره لعذر متصل
          كمرض فلا إثم عليه ويكفيه القضاء. راجع أهل العلم في حالتك.
        </FiqhNote>
      ) : status.remaining > 0 ? (
        <FiqhNote>
          وقت القضاء واسع إلى رمضان القادم، والمبادرة به أبرأ للذمة. ومن أخّره حتى دخل رمضان آخر بلا عذر فعليه التوبة مع القضاء، وأوجب جمهور الفقهاء
          معه إطعام مسكين عن كل يوم. راجع أهل العلم في حالتك.
        </FiqhNote>
      ) : null}

      {/* ── Proposed days ──────────────────────────── */}
      {days.length ? (
        <section className="flex flex-col gap-2.5">
          <SectionTitle title="أيام مقترحة" subtitle="الإثنين والخميس والأيام البيض أولاً، والقضاء فيها مجزئ" />
          <Card className="p-1.5 divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {(showAll ? days : days.slice(0, SHOWN)).map((d) => {
              const date = dateOf(d.key);
              return (
                <div key={d.key} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="w-9 h-9 rounded-xl bg-teal/10 text-teal dark:text-teal-light inline-flex items-center justify-center shrink-0">
                    <Moon size={15} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-text-primary dark:text-text-on-dark font-counter tabular-nums">{dayLabelAr(date)}</p>
                    <p className="text-[11px] text-text-muted font-counter tabular-nums">{hijriLabelAr(date, offset)}</p>
                  </div>
                  {d.key === tomorrowK ? (
                    <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-bold text-gold-dark dark:text-gold-light">غداً</span>
                  ) : null}
                  {FAST_DAY_KIND_AR[d.kind] ? (
                    <span className="rounded-full bg-cream-dark/70 dark:bg-white/[0.06] px-2 py-0.5 text-[11px] font-semibold text-text-secondary dark:text-text-on-dark/75 whitespace-nowrap">
                      {FAST_DAY_KIND_AR[d.kind]}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </Card>
          {days.length > SHOWN ? (
            <Button variant="ghost" size="sm" className="self-center min-h-11" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'عرض أقل' : `عرض كل الأيام (${toArabicDigits(days.length)})`}
            </Button>
          ) : null}
          {shortfall > 0 ? (
            <p className="px-1 text-xs text-warning text-pretty">
              لا تتسع الأيام الباقية قبل رمضان لـ{nDays(shortfall)} مما عليك؛ صُم ما استطعت، ويبقى الباقي ديناً تقضيه بعده.
            </p>
          ) : null}
          {blocked.length ? (
            <p className="px-1 text-xs text-text-muted text-pretty">
              لا يُصام قبل رمضان: {blocked.map((b) => `${dayLabelAr(dateOf(b.key))} (${BLOCKED_AR[b.reason].split('،')[0]})`).join('، ')}
            </p>
          ) : null}
          <p className="px-1 text-[11px] text-text-muted">يُعاد ترتيب الأيام كلما سجّلت يوماً قضيته. وصيام القضاء تُبيَّت نيته من الليل.</p>
        </section>
      ) : null}

      {/* ── A past day ─────────────────────────────── */}
      <section className="flex flex-col gap-2.5">
        <SectionTitle title="صمتَ يوماً سابقاً؟" subtitle="سجّله قضاءً، ويُحسب صياماً في سجلك أيضاً" />
        <Card className="p-3 flex items-center gap-2">
          <input
            type="date"
            dir="ltr"
            max={todayK}
            value={pastDay}
            onChange={(e) => setPastDay(e.target.value)}
            className={`${dateInputClass} flex-1 min-w-0`}
            aria-label="يوم الصيام"
          />
          <Button variant="soft" size="sm" className="min-h-11 shrink-0" disabled={!pastDay} onClick={markPast} leftIcon={<CalendarPlus size={15} />}>
            سجّله قضاءً
          </Button>
        </Card>
      </section>

      {/* ── What was entered ───────────────────────── */}
      <section className="flex flex-col gap-2.5">
        <SectionTitle
          title="ما سجّلته"
          subtitle="يُقضى الأقدم أولاً"
          action={
            <Button variant="soft" size="sm" leftIcon={<Plus size={15} />} onClick={() => setAdding(true)}>
              أضف
            </Button>
          }
        />
        <Card className="p-1.5 divide-y divide-black/[0.05] dark:divide-white/[0.06]">
          {fastDebts.map((d) => (
            <div key={d.id} className="flex items-center gap-3 ps-3 pe-1 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-text-primary dark:text-text-on-dark">
                  رمضان {toArabicDigits(d.year)} · {nDays(d.count)}
                  {overdueYears.has(d.year) ? (
                    <span className="ms-2 rounded-full bg-warning/15 px-2 py-0.5 text-[10.5px] font-bold text-warning align-middle">فات موعده</span>
                  ) : null}
                </p>
                <p className="text-[11px] text-text-muted">
                  {FAST_REASON_AR[d.reason]}
                  {d.source === 'excused' ? ' · من أيام العذر المسجّلة' : ''}
                </p>
              </div>
              <DeleteButton label="حذف هذا القيد" message="يُحذف من مجموع ما عليك، ويبقى ما قضيته محسوباً." onConfirm={() => useQadaStore.getState().removeDebt(d.id)} />
            </div>
          ))}
        </Card>
      </section>

      <Quote text="«كَانَ يَكُونُ عَلَيَّ الصَّوْمُ مِنْ رَمَضَانَ، فَمَا أَسْتَطِيعُ أَنْ أَقْضِيَ إِلَّا فِي شَعْبَانَ»" source="عائشة رضي الله عنها · متفق عليه" />
      <AddFastsSheet open={adding} onClose={() => setAdding(false)} />
    </>
  );
}

const REASON_NOTE: Partial<Record<FastReason, { quote?: [string, string]; note?: string }>> = {
  travel: { quote: ['﴿فَمَن كَانَ مِنكُم مَّرِيضًا أَوْ عَلَىٰ سَفَرٍ فَعِدَّةٌ مِّنْ أَيَّامٍ أُخَرَ﴾', 'البقرة: ١٨٤'] },
  illness: {
    quote: ['﴿فَمَن كَانَ مِنكُم مَّرِيضًا أَوْ عَلَىٰ سَفَرٍ فَعِدَّةٌ مِّنْ أَيَّامٍ أُخَرَ﴾', 'البقرة: ١٨٤'],
    note: 'المرض الذي لا يُرجى برؤه يكون فيه الإطعام عن كل يوم بدل القضاء عند جمهور الفقهاء. راجع أهل العلم في حالتك.',
  },
  haid: { quote: ['«كَانَ يُصِيبُنَا ذَلِكَ، فَنُؤْمَرُ بِقَضَاءِ الصَّوْمِ، وَلَا نُؤْمَرُ بِقَضَاءِ الصَّلَاةِ»', 'عائشة رضي الله عنها · رواه مسلم'] },
  nursing: {
    note: 'الحامل والمرضع إذا أفطرتا تقضيان عند جمهور الفقهاء، واختلفوا في الإطعام مع القضاء إن كان الفطر خوفاً على الولد. راجعي أهل العلم في حالتك.',
  },
};

type Mode = 'count' | 'days';

/** Add owed fasts: reason, which Ramadan, and a count or the exact days. */
export function AddFastsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const offset = useCalendarPrefs((s) => s.hijriOffset);
  const last = lastRamadanYear(new Date(), offset);
  const years = [last, last - 1, last - 2, last - 3];
  const [reason, setReason] = useState<FastReason>('travel');
  const [year, setYear] = useState(last);
  const [mode, setMode] = useState<Mode>('count');
  const [count, setCount] = useState(1);
  const [days, setDays] = useState<string[]>([]);
  const [pick, setPick] = useState('');

  const start = hijriMonthStart(year, 9, offset);
  const minK = keyOf(start);
  const maxK = keyOf(addDays(start, hijriMonthLength(year, 9, offset) - 1));
  const total = mode === 'count' ? count : days.length;
  const note = REASON_NOTE[reason];

  const addDay = () => {
    if (!pick) return;
    const h = toHijri(dateOf(pick), offset);
    if (h.month !== 9 || h.year !== year) {
      toast.warning(`هذا اليوم ليس من رمضان ${toArabicDigits(year)}`);
      return;
    }
    setDays((d) => [...new Set([...d, pick])].sort());
    setPick('');
  };

  const save = () => {
    useQadaStore.getState().addDebt({
      kind: 'fast',
      reason,
      year,
      count: total,
      days: mode === 'days' ? days : undefined,
      source: 'manual',
    });
    toast.success(`أُضيف ${nDays(total)} إلى ما عليك`);
    setDays([]);
    setCount(1);
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="أضف أيام صيام فائتة">
      <div className="flex flex-col gap-4 pb-2">
        <PillGroup label="السبب">
          {FAST_REASONS.map((r) => (
            <Pill key={r} active={reason === r} onClick={() => setReason(r)}>
              {FAST_REASON_AR[r]}
            </Pill>
          ))}
        </PillGroup>

        <PillGroup label="رمضان أي عام">
          {years.map((y) => (
            <Pill
              key={y}
              active={year === y}
              onClick={() => {
                setYear(y);
                setDays([]);
              }}
              className="font-counter tabular-nums"
            >
              {toArabicDigits(y)} هـ
            </Pill>
          ))}
        </PillGroup>

        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'count', label: 'عدد الأيام' },
            { value: 'days', label: 'أيام بعينها' },
          ]}
        />

        {mode === 'count' ? (
          <Field label="كم يوماً؟">
            <NumberInput value={count} min={1} max={30} onValueChange={setCount} className={`${fieldClass} font-counter tabular-nums`} />
          </Field>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <input
                type="date"
                dir="ltr"
                min={minK}
                max={maxK}
                value={pick}
                onChange={(e) => setPick(e.target.value)}
                className={`${dateInputClass} flex-1 min-w-0`}
                aria-label={`يوم من رمضان ${toArabicDigits(year)}`}
              />
              <Button variant="soft" size="sm" className="min-h-11 shrink-0" disabled={!pick} onClick={addDay}>
                أضف اليوم
              </Button>
            </div>
            {days.length ? (
              <div className="flex flex-wrap gap-1.5">
                {days.map((k) => (
                  <span key={k} className="inline-flex items-center gap-1 rounded-full bg-teal/10 ps-2.5 pe-1 py-0.5 text-xs font-semibold text-teal dark:text-teal-light font-counter tabular-nums">
                    {hijriLabelAr(dateOf(k), offset)}
                    <button type="button" onClick={() => setDays((d) => d.filter((x) => x !== k))} aria-label="إزالة اليوم" className="w-7 h-7 inline-flex items-center justify-center rounded-full hover:bg-teal/15">
                      <X size={13} />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-text-muted">اختر الأيام من رمضان {toArabicDigits(year)} واحداً واحداً</p>
            )}
          </div>
        )}

        {note?.quote ? <Quote text={note.quote[0]} source={note.quote[1]} /> : null}
        {note?.note ? <FiqhNote>{note.note}</FiqhNote> : null}

        <Button variant="primary" fullWidth disabled={total <= 0} onClick={save} leftIcon={<Plus size={16} />}>
          أضفها لما عليّ
        </Button>
      </div>
    </BottomSheet>
  );
}
