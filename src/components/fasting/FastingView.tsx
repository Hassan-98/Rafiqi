import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { addDays, addMonths, format, getDaysInMonth, startOfMonth } from 'date-fns';
import { BarChart3, Check, ChevronLeft, ChevronRight, History, Moon, MoonStar, Sparkles, Sunrise, Undo2, X } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { CompletionBlessing } from '@/components/ui/CompletionBlessing';
import { ArchMotif, Medallion, SectionTitle } from '@/components/ui/Ornament';
import { QadaFastToggle } from '@/components/qada/QadaFastToggle';
import { useProgressStore } from '@/store/progressStore';
import { usePrayerLogStore } from '@/store/prayerLogStore';
import { useAttentionStore } from '@/store/attentionStore';
import { useSettingsStore } from '@/store/settingsStore';
import { setQadaFast, useQadaStore } from '@/store/qadaStore';
import { useCalendarPrefs, countdownAr, HIJRI_MONTHS_AR, toHijri } from '@/services/calendarEvents';
import { fastStatus } from '@/services/qadaPlan';
import { BLOCKED_AR, dayInfo, fastedKeys, fastingStats, sixOfShawwalDone, upcomingFasts, type DayInfo } from '@/services/fastingPlan';
import { ARABIC_MONTHS, WEEKDAY_LABELS_AR } from '@/services/statsService';
import { hapticsService } from '@/services/HapticsService';
import { toast } from '@/store/toastStore';
import { toArabicDigits as ar } from '@/utils/arabicFormat';

const dk = (d: Date) => format(d, 'yyyy-MM-dd');
const noonOf = (key: string) => new Date(`${key}T12:00:00`);
/** The app's weeks run Saturday → Friday. */
const WEEK_HEAD = ['س', 'ح', 'ن', 'ث', 'ر', 'خ', 'ج'];
const satIndex = (wd: number) => (wd + 1) % 7;
const dayTitle = (d: Date) => `${WEEKDAY_LABELS_AR[d.getDay()]} ${ar(d.getDate())} ${ARABIC_MONTHS[d.getMonth()]}`;
const hijriShort = (d: DayInfo['hijri']) => `${ar(d.day)} ${HIJRI_MONTHS_AR[d.month - 1]}`;

/** Log or unlog a fast on any past day or today (the progress store, as everywhere). */
function setFast(key: string, on: boolean) {
  const p = useProgressStore.getState();
  if (on) {
    p.markModuleComplete('fasting', 1, key);
    void hapticsService.notify('success');
    toast.success('تقبّل الله صيامك');
  } else {
    p.unmarkModuleComplete('fasting', key);
    setQadaFast(key, false, false);
    void hapticsService.impact('medium');
    toast.info('أُلغي تسجيل الصيام');
  }
}

/**
 * «الصيام» in «عباداتي» (and /module/fasting, which redirects here): today in
 * one tap, the night's intention for tomorrow (its suhoor reminder rides on it),
 * any past day from the calendar, the sunnah fasts ahead, and the counts —
 * with qada fasts marked and owed ones one tap away.
 */
export function FastingView() {
  const navigate = useNavigate();
  const offset = useCalendarPrefs((s) => s.hijriOffset);
  const dailyProgress = useProgressStore((s) => s.dailyProgress);
  const paid = useQadaStore((s) => s.paid);
  const debts = useQadaStore((s) => s.debts);
  const intent = useAttentionStore((s) => s.fastIntent);
  const setIntent = useAttentionStore((s) => s.setFastIntent);
  const female = useSettingsStore((s) => s.gender) === 'female';
  const now = new Date();
  const todayKey = dk(now);
  const tomorrowKey = dk(addDays(now, 1));
  const excused = usePrayerLogStore((s) => !!s.excused[todayKey]);
  const [blessing, setBlessing] = useState(false);
  const [sheet, setSheet] = useState<string | null>(null);
  const [month, setMonth] = useState(() => startOfMonth(now));

  const fasted = useMemo(() => fastedKeys(dailyProgress), [dailyProgress]);
  const sixDone = useMemo(() => sixOfShawwalDone(fasted, now, offset), [fasted, offset, todayKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const today = dayInfo(now, offset, sixDone);
  const tomorrow = dayInfo(addDays(now, 1), offset, sixDone);
  const stats = useMemo(() => fastingStats(fasted, now, offset), [fasted, offset, todayKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const ahead = useMemo(() => upcomingFasts(now, offset, sixDone, 14).slice(0, 5), [offset, sixDone, todayKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const owed = useMemo(() => fastStatus({ debts, paid }, now, offset).remaining, [debts, paid, offset, todayKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const fastedToday = fasted.has(todayKey);
  const g = (m: string, f: string) => (female ? f : m);

  const logToday = () => {
    setFast(todayKey, true);
    setBlessing(true);
  };

  // ── the hero's words ──
  const headline = fastedToday
    ? g('صائم اليوم، تقبّل الله', 'صائمة اليوم، تقبّل الله')
    : today.blocked
      ? BLOCKED_AR[today.blocked]
      : excused
        ? 'يوم عذر — لا صيام عليكِ اليوم'
        : today.ramadan
          ? 'هل صمت اليوم؟'
          : g('هل أنت صائم اليوم؟', 'هل أنتِ صائمة اليوم؟');
  const canLogToday = !fastedToday && !today.blocked && !excused;
  const intentFor = intent === tomorrowKey;

  return (
    <div className="flex flex-col gap-6">
      {/* ── Today ── */}
      <Card variant="gradient-edge" className="p-5">
        <ArchMotif className="absolute -top-6 -end-4 w-28 text-gold opacity-20" />
        <div className="relative flex items-center gap-4">
          <Medallion size={66} tone={fastedToday ? 'teal' : 'gold'}>
            {fastedToday ? <Check size={26} strokeWidth={3} className="text-teal dark:text-teal-light" /> : <Moon size={24} className="text-gold-dark dark:text-gold-light" />}
          </Medallion>
          <div className="min-w-0 flex-1">
            <p className="text-[11.5px] text-text-muted">
              {dayTitle(now)} · {hijriShort(today.hijri)}
            </p>
            <p className="mt-0.5 font-display text-[20px] font-bold leading-snug text-text-primary dark:text-text-on-dark text-balance">{headline}</p>
            {today.ramadan ? (
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-gold/15 px-2.5 py-0.5 text-[11.5px] font-bold text-gold-dark dark:text-gold-light">
                <MoonStar size={12} aria-hidden /> رمضان · اليوم {ar(today.hijri.day)}
              </span>
            ) : today.reason && !fastedToday ? (
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-gold/15 px-2.5 py-0.5 text-[11.5px] font-bold text-gold-dark dark:text-gold-light">
                <Sparkles size={12} aria-hidden /> اليوم {today.reason.name} — يُسنّ صيامه
              </span>
            ) : null}
          </div>
        </div>
        {today.reason && !fastedToday && canLogToday ? (
          <p className="relative mt-3 text-[12.5px] leading-relaxed text-text-secondary dark:text-text-on-dark/80 text-pretty">{today.reason.body}</p>
        ) : null}

        <div className="relative mt-4 flex flex-col gap-2">
          {fastedToday ? (
            <Button variant="ghost" fullWidth leftIcon={<Undo2 size={15} />} onClick={() => setFast(todayKey, false)} haptic="medium">
              إلغاء تسجيل صيام اليوم
            </Button>
          ) : canLogToday ? (
            <Button variant="primary" fullWidth leftIcon={<Moon size={16} />} onClick={logToday} haptic="medium">
              {today.ramadan ? 'صمتُ اليوم' : g('أنا صائم اليوم', 'أنا صائمة اليوم')}
            </Button>
          ) : null}
          <QadaFastToggle dayKey={todayKey} />
        </div>

        {/* Tomorrow: the intention is made by night — and «رفيقك اليومي» wakes its suhoor. */}
        {!tomorrow.blocked && !tomorrow.ramadan ? (
          <div className="relative mt-3 pt-3 border-t border-gold/20 flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-teal/10 text-teal dark:text-teal-light inline-flex items-center justify-center shrink-0" aria-hidden>
              <Sunrise size={17} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[13.5px] font-semibold text-text-primary dark:text-text-on-dark">
                {intentFor ? g('نويتَ صيام الغد', 'نويتِ صيام الغد') : tomorrow.reason ? `غداً ${tomorrow.reason.name}` : 'صيام الغد'}
              </span>
              <span className="block text-[11.5px] text-text-muted text-pretty">
                {intentFor ? 'نذكّرك بالسحور قبل الفجر — «تسحّروا فإن في السحور بركة»' : 'انوِ من الليل، ونذكّرك بالسحور'}
              </span>
            </span>
            {intentFor ? (
              <button
                type="button"
                onClick={() => setIntent(null)}
                className="shrink-0 w-10 h-10 rounded-xl inline-flex items-center justify-center text-text-muted hover:bg-danger/10 hover:text-danger"
                aria-label="إلغاء نية صيام الغد"
              >
                <X size={17} />
              </button>
            ) : (
              <Button
                variant="soft"
                size="sm"
                className="shrink-0"
                onClick={() => {
                  setIntent(tomorrowKey);
                  toast.success(g('نويتَ صيام الغد، تقبّل الله', 'نويتِ صيام الغد، تقبّل الله'), 'نذكّرك بالسحور قبل الفجر');
                }}
              >
                سأصومه بإذن الله
              </Button>
            )}
          </div>
        ) : null}
      </Card>

      {/* ── The counts ── */}
      <div className="grid grid-cols-3 gap-2">
        {stats.ramadan ? (
          <Tile label="رمضان" value={`${ar(stats.ramadan.fasted)}/${ar(stats.ramadan.sofar)}`} gold />
        ) : (
          <Tile label="هذا الشهر" value={ar(stats.month)} />
        )}
        <Tile label={`عام ${ar(today.hijri.year)} هـ`} value={ar(stats.year)} />
        {owed > 0 ? (
          <Tile label="قضاء عليك" value={ar(owed)} gold onClick={() => navigate('/targets?tab=qada&view=fasts')} />
        ) : (
          <Tile label="كل صيامك" value={ar(stats.total)} />
        )}
      </div>

      {/* ── The calendar: any past day, one tap ── */}
      <section className="flex flex-col gap-2.5">
        <SectionTitle title="تقويم صيامك" subtitle="اضغط أي يوم مضى لتسجيل صيامه أو إلغائه" />
        <MonthCalendar month={month} onMonth={setMonth} fasted={fasted} paid={paid} offset={offset} todayKey={todayKey} onDay={setSheet} />
      </section>

      {/* ── The sunnah fasts ahead ── */}
      {ahead.length ? (
        <section className="flex flex-col gap-2.5">
          <SectionTitle title="أيام صيام قادمة" subtitle="سننٌ في الأيام القادمة، والنية من الليل" />
          <Card className="p-1.5">
            <ul className="flex flex-col">
              {ahead.map((u, i) => (
                <li key={u.key} className={['flex items-center gap-3 px-3 py-2.5', i ? 'border-t border-black/[0.05] dark:border-white/[0.06]' : ''].join(' ')}>
                  <span
                    className={[
                      'w-11 shrink-0 rounded-xl py-1.5 flex flex-col items-center leading-none',
                      u.reason.major ? 'bg-[image:var(--gradient-gold)] text-[#2a1d05]' : 'bg-gold/12 text-gold-dark dark:text-gold-light',
                    ].join(' ')}
                    aria-hidden
                  >
                    <span className="font-counter tabular-nums text-[16px] font-bold">{ar(u.date.getDate())}</span>
                    <span className="mt-0.5 text-[9.5px]">{ARABIC_MONTHS[u.date.getMonth()]}</span>
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[14px] font-semibold text-text-primary dark:text-text-on-dark truncate">{u.reason.name}</span>
                    <span className="block text-[11.5px] text-text-muted">
                      {WEEKDAY_LABELS_AR[u.date.getDay()]} · {countdownAr(u.daysUntil)}
                    </span>
                  </span>
                  {u.daysUntil === 1 && intent !== u.key ? (
                    <Button variant="soft" size="sm" className="shrink-0" onClick={() => setIntent(u.key)}>
                      سأصومه
                    </Button>
                  ) : u.daysUntil === 1 ? (
                    <span className="shrink-0 inline-flex items-center gap-1 text-[12px] font-bold text-teal dark:text-teal-light">
                      <Check size={14} aria-hidden /> {g('نويتَه', 'نويتِه')}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="ghost" size="sm" leftIcon={<BarChart3 size={15} />} onClick={() => navigate('/stats/fasting')}>
          إحصاءات الصيام
        </Button>
        <Button variant="ghost" size="sm" leftIcon={<History size={15} />} onClick={() => navigate('/targets?tab=qada&view=fasts')}>
          قضاء الصيام
        </Button>
      </div>

      <DaySheet dayKey={sheet} fasted={sheet ? fasted.has(sheet) : false} offset={offset} sixDone={sixDone} onClose={() => setSheet(null)} />
      <CompletionBlessing open={blessing} message="تقبّل الله صيامك" onDone={() => setBlessing(false)} />
    </div>
  );
}

function Tile({ label, value, gold = false, onClick }: { label: string; value: string; gold?: boolean; onClick?: () => void }) {
  const body = (
    <>
      <span className="text-[10.5px] text-text-muted truncate">{label}</span>
      <span className={['font-counter tabular-nums text-[20px] font-bold leading-tight', gold ? 'text-gold-dark dark:text-gold-light' : 'text-text-primary dark:text-text-on-dark'].join(' ')}>
        {value}
      </span>
    </>
  );
  const cls = [
    'min-w-0 rounded-[var(--radius-inner)] px-3 py-2.5 flex flex-col gap-0.5 text-start',
    gold ? 'bg-gold/10 ring-1 ring-gold/30' : 'bg-white dark:bg-dark-card ring-1 ring-black/[0.04] dark:ring-white/[0.06]',
  ].join(' ');
  return onClick ? (
    <button type="button" onClick={onClick} className={[cls, 'hover:bg-gold/15 transition-colors'].join(' ')}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** A Gregorian month, Saturday-first, each day with its Hijri date; past days open their sheet. */
function MonthCalendar({
  month,
  onMonth,
  fasted,
  paid,
  offset,
  todayKey,
  onDay,
}: {
  month: Date;
  onMonth: (m: Date) => void;
  fasted: ReadonlySet<string>;
  paid: Readonly<Record<string, { fast?: number } | undefined>>;
  offset: number;
  todayKey: string;
  onDay: (key: string) => void;
}) {
  const days = getDaysInMonth(month);
  const lead = satIndex(month.getDay());
  const cells = useMemo(
    () => Array.from({ length: days }, (_, i) => dayInfo(new Date(month.getFullYear(), month.getMonth(), i + 1, 12), offset)),
    [month, days, offset],
  );
  const count = cells.filter((c) => fasted.has(c.key)).length;
  const h0 = cells[0].hijri;
  const h1 = cells[cells.length - 1].hijri;
  const hijriSpan =
    h0.month === h1.month
      ? `${HIJRI_MONTHS_AR[h0.month - 1]} ${ar(h0.year)}`
      : `${HIJRI_MONTHS_AR[h0.month - 1]} – ${HIJRI_MONTHS_AR[h1.month - 1]} ${ar(h1.year)}`;
  const isCurrent = dk(month).slice(0, 7) === todayKey.slice(0, 7);

  return (
    <Card className="p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onMonth(addMonths(month, -1))}
          className="w-10 h-10 rounded-xl inline-flex items-center justify-center text-text-secondary hover:bg-teal/10"
          aria-label="الشهر السابق"
        >
          <ChevronRight size={18} />
        </button>
        <div className="flex-1 min-w-0 text-center">
          <p className="font-display text-[15px] font-bold text-text-primary dark:text-text-on-dark">
            {ARABIC_MONTHS[month.getMonth()]} {ar(month.getFullYear())}
          </p>
          <p className="text-[11px] text-text-muted text-balance">{hijriSpan}</p>
          <p className="text-[11px] font-semibold text-teal dark:text-teal-light">
            {count === 0
              ? 'لا صيام مسجّل'
              : count === 1
                ? 'صمت يوماً واحداً'
                : count === 2
                  ? 'صمت يومين'
                  : `صمت ${ar(count)} ${count <= 10 ? 'أيام' : 'يوماً'}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onMonth(addMonths(month, 1))}
          disabled={isCurrent}
          className="w-10 h-10 rounded-xl inline-flex items-center justify-center text-text-secondary hover:bg-teal/10 disabled:opacity-30 disabled:pointer-events-none"
          aria-label="الشهر التالي"
        >
          <ChevronLeft size={18} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1.5" role="grid" aria-label="أيام الشهر">
        {WEEK_HEAD.map((d) => (
          <span key={d} className="text-center text-[10.5px] text-text-muted font-bold pb-0.5" aria-hidden>
            {d}
          </span>
        ))}
        {Array.from({ length: lead }).map((_, i) => (
          <span key={`b${i}`} aria-hidden />
        ))}
        {cells.map((c, i) => {
          const on = fasted.has(c.key);
          const qada = on && (paid[c.key]?.fast ?? 0) > 0;
          const future = c.key > todayKey;
          const isToday = c.key === todayKey;
          const label = `${ar(i + 1)}${on ? (qada ? '، صيام قضاء' : '، صائم') : ''}${c.reason && !on ? `، ${c.reason.name}` : ''}${c.blocked ? '، عيد' : ''}`;
          return (
            <button
              key={c.key}
              type="button"
              disabled={future}
              onClick={() => onDay(c.key)}
              aria-label={label}
              className={[
                'relative aspect-square rounded-xl flex flex-col items-center justify-center leading-none transition-colors',
                on
                  ? 'bg-[image:var(--gradient-teal)] text-on-accent shadow-[var(--shadow-xs)]'
                  : future
                    ? 'text-text-muted/50'
                    : c.blocked
                      ? 'bg-cream-dark/30 dark:bg-white/[0.02] text-text-muted/60'
                      : c.ramadan
                        ? 'bg-teal/[0.07] text-text-secondary dark:text-text-on-dark/80 hover:bg-teal/15'
                        : 'bg-cream-dark/45 dark:bg-dark-surface text-text-secondary dark:text-text-on-dark/75 hover:bg-teal/10',
                qada ? 'ring-2 ring-gold' : isToday ? 'ring-2 ring-gold ring-offset-2 ring-offset-white dark:ring-offset-dark-card' : '',
              ].join(' ')}
            >
              <span className="font-counter tabular-nums text-[13px] font-bold">{ar(i + 1)}</span>
              <span className={['font-counter tabular-nums text-[8.5px] mt-0.5', on ? 'text-on-accent/75' : 'text-text-muted/80'].join(' ')}>{ar(c.hijri.day)}</span>
              {c.reason && !on ? <span aria-hidden className="absolute top-1 end-1 w-1.5 h-1.5 rounded-full bg-gold" /> : null}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-x-3.5 gap-y-1 text-[10.5px] text-text-muted" aria-hidden>
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded bg-[image:var(--gradient-teal)]" /> صمت
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded ring-2 ring-gold" /> قضاء
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-gold" /> يُسنّ صيامه
        </span>
        <span>الرقم الصغير: اليوم الهجري</span>
      </div>
    </Card>
  );
}

/** One day: what it is, and its fast — logged, unlogged, or marked qada. */
function DaySheet({ dayKey, fasted, offset, sixDone, onClose }: { dayKey: string | null; fasted: boolean; offset: number; sixDone: boolean; onClose: () => void }) {
  const info = dayKey ? dayInfo(noonOf(dayKey), offset, sixDone) : null;
  const d = dayKey ? noonOf(dayKey) : null;
  const h = d ? toHijri(d, offset) : null;
  return (
    <BottomSheet open={!!dayKey} onClose={onClose} title={d ? dayTitle(d) : ''}>
      {info && d && h ? (
        <div className="flex flex-col gap-4">
          <p className="text-[13px] text-text-muted">
            {ar(h.day)} {HIJRI_MONTHS_AR[h.month - 1]} {ar(h.year)} هـ
          </p>
          {info.blocked ? (
            <p className="rounded-[var(--radius-inner)] bg-cream-dark/50 dark:bg-white/[0.05] px-3.5 py-3 text-[13.5px] text-text-secondary dark:text-text-on-dark/85">{BLOCKED_AR[info.blocked]}</p>
          ) : info.ramadan ? (
            <p className="rounded-[var(--radius-inner)] bg-teal/10 px-3.5 py-3 text-[13.5px] text-teal dark:text-teal-light font-semibold">من أيام رمضان</p>
          ) : info.reason ? (
            <div className="rounded-[var(--radius-inner)] bg-gold/10 ring-1 ring-gold/25 px-3.5 py-3">
              <p className="text-[13.5px] font-bold text-gold-dark dark:text-gold-light">{info.reason.name} — يُسنّ صيامه</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-text-secondary dark:text-text-on-dark/80 text-pretty">{info.reason.body}</p>
            </div>
          ) : null}

          {info.blocked && !fasted ? null : fasted ? (
            <Button
              variant="ghost"
              fullWidth
              leftIcon={<Undo2 size={15} />}
              onClick={() => {
                setFast(dayKey!, false);
                onClose();
              }}
            >
              إلغاء تسجيل صيام هذا اليوم
            </Button>
          ) : (
            <Button
              fullWidth
              leftIcon={<Moon size={16} />}
              onClick={() => {
                setFast(dayKey!, true);
              }}
            >
              صمتُ هذا اليوم
            </Button>
          )}
          {/* Once logged, it can be marked qada (when fasts are owed). */}
          <QadaFastToggle dayKey={dayKey!} />
        </div>
      ) : null}
    </BottomSheet>
  );
}
