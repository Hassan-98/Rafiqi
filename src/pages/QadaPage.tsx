import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { BellRing, CalendarHeart, Plus, ShieldCheck } from 'lucide-react';
import { TopAppBar } from '@/components/layout/TopAppBar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { ArchMotif, SectionTitle } from '@/components/ui/Ornament';
import { Segmented } from '@/components/study/studyUi';
import { AddPrayersSheet, QadaPrayers } from '@/components/qada/QadaPrayers';
import { AddFastsSheet, QadaFasts } from '@/components/qada/QadaFasts';
import { DeleteButton, dateInputClass } from '@/components/qada/qadaUi';
import { useQadaStore } from '@/store/qadaStore';
import { usePrayerLogStore } from '@/store/prayerLogStore';
import { useCalendarPrefs } from '@/services/calendarEvents';
import { notificationService } from '@/services/NotificationService';
import { rescheduleQada } from '@/services/qadaReminders';
import { toast } from '@/store/toastStore';
import {
  PRAYER_AR,
  QADA_PRAYERS,
  dateOf,
  dayLabelAr,
  excusedRamadanSuggestions,
  fastStatus,
  keyOf,
  nDays,
  nPrayers,
  numAr,
  prayerTotals,
  unloggedFardSuggestions,
} from '@/services/qadaPlan';
import { toArabicDigits } from '@/utils/arabicFormat';
import { days as daysGen } from '@/services/insightsEngine';

type Tab = 'prayers' | 'fasts' | 'history';

const TABS: Tab[] = ['prayers', 'fasts', 'history'];

/** One focal element: what remains, the overall ring, the Ramadan countdown, the verified text. */
function QadaHero({ onAddPrayers, onAddFasts }: { onAddPrayers: () => void; onAddFasts: () => void }) {
  const debts = useQadaStore((s) => s.debts);
  const paid = useQadaStore((s) => s.paid);
  const offset = useCalendarPrefs((s) => s.hijriOffset);
  const pt = prayerTotals({ debts, paid });
  const fs = fastStatus({ debts, paid }, new Date(), offset);
  const owed = pt.owedTotal + fs.owed;
  const done = pt.paidTotal + fs.paid;
  const pct = owed ? Math.round((done / owed) * 100) : 0;
  const clear = owed > 0 && pt.remainingTotal + fs.remaining === 0;

  return (
    <Card variant="hero" className="p-5">
      <ArchMotif className="absolute -top-6 -start-8 w-40 opacity-15" />
      <div className="relative">
        {owed === 0 ? (
          <>
            <p className="text-xs text-on-accent/75">قضاء ما فات</p>
            <h2 className="mt-1 text-xl font-display font-bold text-balance">لا شيء عليك مسجّلاً</h2>
            <p className="mt-1 text-[13px] text-on-accent/80 text-pretty">
              إن فاتتك صلاة أو أفطرت أياماً من رمضان لعذر، سجّلها هنا ونضع لك خطة هادئة لقضائها.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="gold" size="sm" className="min-h-11" leftIcon={<Plus size={15} />} onClick={onAddPrayers}>
                صلوات فائتة
              </Button>
              <Button variant="secondary" size="sm" className="min-h-11" leftIcon={<Plus size={15} />} onClick={onAddFasts}>
                أيام صيام
              </Button>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <ProgressRing
                value={pct}
                size={84}
                strokeWidth={7}
                showPercent={false}
                colorFrom="var(--color-on-accent)"
                colorTo="var(--color-gold-light)"
                trackColor="color-mix(in srgb, var(--color-on-accent) 18%, transparent)"
              />
              <span className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-counter font-bold tabular-nums leading-none">{toArabicDigits(pct)}٪</span>
                <span className="text-[10px] text-on-accent/75 mt-0.5">قضيت</span>
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-on-accent/75">{clear ? 'تقبّل الله منك' : 'بقي عليك'}</p>
              {clear ? (
                <h2 className="mt-1 text-xl font-display font-bold text-balance">أتممت قضاء ما سجّلت</h2>
              ) : (
                <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
                  {pt.remainingTotal ? (
                    <p className="flex flex-col">
                      <b className="text-2xl font-counter tabular-nums leading-tight">{numAr(pt.remainingTotal)}</b>
                      <span className="text-[11.5px] text-on-accent/80">صلوات</span>
                    </p>
                  ) : null}
                  {fs.remaining ? (
                    <p className="flex flex-col">
                      <b className="text-2xl font-counter tabular-nums leading-tight">{numAr(fs.remaining)}</b>
                      <span className="text-[11.5px] text-on-accent/80">أيام صيام</span>
                    </p>
                  ) : null}
                </div>
              )}
              {fs.remaining ? (
                <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-on-accent/12 px-2.5 py-0.5 text-[11.5px] font-semibold">
                  <CalendarHeart size={12} /> بقي {nDays(fs.daysToRamadan)} على رمضان
                </span>
              ) : null}
            </div>
          </div>
        )}
        <p className="mt-4 pt-3 border-t border-on-accent/15 text-center font-ornate text-[17px] leading-relaxed">
          «فَدَيْنُ اللَّهِ أَحَقُّ أَنْ يُقْضَى» <span className="text-[11px] font-sans text-on-accent/70">متفق عليه</span>
        </p>
      </div>
    </Card>
  );
}

/** Things found in the logs — each needs the user's yes before it counts. */
function Suggestions() {
  const debts = useQadaStore((s) => s.debts);
  const dismissed = useQadaStore((s) => s.dismissed);
  const excused = usePrayerLogStore((s) => s.excused);
  const log = usePrayerLogStore((s) => s.log);
  const offset = useCalendarPrefs((s) => s.hijriOffset);
  const [more, setMore] = useState(false);

  const today = new Date();
  const ex = excusedRamadanSuggestions(excused, { debts, dismissed }, keyOf(today), offset);
  const lg = unloggedFardSuggestions(log, excused, dismissed, today);
  if (!ex.length && !lg.length) return null;
  const store = useQadaStore.getState();

  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle title="للتأكيد" subtitle="وجدناها في سجلّك، ولا يُحسب شيء إلا بموافقتك" />
      {ex.map((s) => (
        <Card key={s.year} variant="gold-rim" className="p-4">
          <p className="text-sm font-bold text-text-primary dark:text-text-on-dark">
            {nDays(s.days.length)} عذر في رمضان {toArabicDigits(s.year)}
          </p>
          <p className="text-xs text-text-secondary dark:text-text-on-dark/75 mt-1 text-pretty">
            سجّلتِها في سجل الصلاة، وصيامها دَين يُقضى. إن كنتِ قضيتِها من قبل فاختاري «قضيتُها».
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              variant="primary"
              size="sm"
              className="min-h-11 flex-1"
              onClick={() => {
                store.addDebt({ kind: 'fast', reason: 'haid', year: s.year, count: s.days.length, days: s.days, source: 'excused' });
                toast.success(`أُضيف ${nDays(s.days.length)} إلى ما عليكِ`);
              }}
            >
              أضيفيها
            </Button>
            <Button variant="ghost" size="sm" className="min-h-11 flex-1" onClick={() => store.dismiss(s.days.map((d) => `ex:${d}`))}>
              قضيتُها
            </Button>
          </div>
        </Card>
      ))}
      {lg.length ? (
        <Card className="p-1.5">
          <p className="px-3 pt-2.5 pb-1 text-xs text-text-secondary dark:text-text-on-dark/75 text-pretty">
            أيام سجّلت فيها أغلب الفروض دون بعضها. إن فاتتك فأضفها، وإن صلّيتها ولم تسجّلها فاختر «صلّيتها».
          </p>
          <div className="divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {(more ? lg : lg.slice(0, 3)).map((s) => (
              <div key={s.day} className="flex items-center gap-2 px-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-text-primary dark:text-text-on-dark font-counter tabular-nums">{dayLabelAr(dateOf(s.day))}</p>
                  <p className="text-[11.5px] text-text-muted">{s.prayers.map((p) => PRAYER_AR[p]).join('، ')}</p>
                </div>
                <Button
                  variant="soft"
                  size="sm"
                  className="min-h-11"
                  onClick={() => {
                    store.addDebt({ kind: 'prayer', counts: Object.fromEntries(s.prayers.map((p) => [p, 1])), source: 'log', note: dayLabelAr(dateOf(s.day)) });
                    store.dismiss([`log:${s.day}`]);
                    toast.success(`أُضيفت ${nPrayers(s.prayers.length)} إلى ما عليك`);
                  }}
                >
                  فاتتني
                </Button>
                <Button variant="ghost" size="sm" className="min-h-11" onClick={() => store.dismiss([`log:${s.day}`])}>
                  صلّيتها
                </Button>
              </div>
            ))}
          </div>
          {lg.length > 3 && !more ? (
            <Button variant="ghost" size="sm" fullWidth className="min-h-11" onClick={() => setMore(true)}>
              {`و${toArabicDigits(lg.length - 3)} أيام أخرى`}
            </Button>
          ) : null}
        </Card>
      ) : null}
    </section>
  );
}

/** What was paid, newest day first. */
function History() {
  const paid = useQadaStore((s) => s.paid);
  const [limit, setLimit] = useState(30);
  const days = Object.keys(paid).sort().reverse();
  const totalPrayers = days.reduce((a, k) => a + QADA_PRAYERS.reduce((b, p) => b + (paid[k][p] ?? 0), 0), 0);
  const totalFasts = days.filter((k) => (paid[k].fast ?? 0) > 0).length;

  if (!days.length) {
    return (
      <Card variant="inset" className="p-5 text-center">
        <p className="text-sm text-text-secondary dark:text-text-on-dark/80 text-pretty">
          هنا يظهر ما قضيته يوماً بيوم. ابدأ بفرض واحد مع صلاتك القادمة.
        </p>
      </Card>
    );
  }

  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle
        title="ما قضيته"
        subtitle={[totalPrayers ? nPrayers(totalPrayers) : '', totalFasts ? `صيام ${daysGen(totalFasts)}` : ''].filter(Boolean).join(' و')}
      />
      <Card className="p-1.5 divide-y divide-black/[0.05] dark:divide-white/[0.06]">
        {days.slice(0, limit).map((k) => {
          const d = paid[k];
          const parts = [
            ...QADA_PRAYERS.filter((p) => d[p]).map((p) => `${PRAYER_AR[p]}${(d[p] ?? 0) > 1 ? ` ${toArabicDigits(d[p]!)}` : ''}`),
            ...(d.fast ? ['صيام'] : []),
          ];
          return (
            <div key={k} className="flex items-center gap-3 ps-3 pe-1 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-text-primary dark:text-text-on-dark font-counter tabular-nums">{dayLabelAr(dateOf(k))}</p>
                <p className="text-[11.5px] text-text-muted font-counter tabular-nums text-pretty">{parts.join('، ')}</p>
              </div>
              <DeleteButton
                label="حذف قضاء هذا اليوم"
                message="يعود ما قضيته في هذا اليوم إلى ما عليك. ويبقى الصيام مسجّلاً في سجل الصيام."
                onConfirm={() => useQadaStore.setState((s) => {
                  const next = { ...s.paid };
                  delete next[k];
                  return { paid: next };
                })}
              />
            </div>
          );
        })}
      </Card>
      {days.length > limit ? (
        <Button variant="ghost" size="sm" className="self-center min-h-11" onClick={() => setLimit((n) => n + 60)}>
          عرض المزيد
        </Button>
      ) : null}
    </section>
  );
}

function Reminders() {
  const s = useQadaStore((x) => x.settings);
  const setSettings = useQadaStore((x) => x.setSettings);

  const enable = async (patch: { daily?: boolean; ramadan?: boolean }) => {
    if (Object.values(patch).some(Boolean) && notificationService.isAvailable() && !(await notificationService.requestPermission())) {
      toast.error('فعّل إذن الإشعارات أولاً');
      return;
    }
    setSettings(patch);
  };

  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle title="التذكير" subtitle="نصوصه لا تذكر عدد ما عليك" />
      <Card className="p-1.5 divide-y divide-black/[0.05] dark:divide-white/[0.06]">
        <div className="flex items-start gap-3 px-3 py-3">
          <span className="w-9 h-9 rounded-xl bg-teal/10 text-teal dark:text-teal-light inline-flex items-center justify-center shrink-0">
            <BellRing size={16} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-text-primary dark:text-text-on-dark">تذكير يومي بالخطة</p>
            <p className="text-[11.5px] text-text-muted text-pretty">وفي مساء اليوم السابق لكل صيام مقترح</p>
            {s.daily ? (
              <label className="mt-2 flex items-center gap-2 text-xs text-text-secondary dark:text-text-on-dark/80">
                الوقت
                <input type="time" dir="ltr" value={s.time} onChange={(e) => e.target.value && setSettings({ time: e.target.value })} className={dateInputClass} />
              </label>
            ) : null}
          </div>
          <Toggle checked={s.daily} onChange={(v) => void enable({ daily: v })} label="تذكير يومي بخطة القضاء" hideLabel />
        </div>
        <div className="flex items-start gap-3 px-3 py-3">
          <span className="w-9 h-9 rounded-xl bg-gold/15 text-gold-dark dark:text-gold-light inline-flex items-center justify-center shrink-0">
            <CalendarHeart size={16} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-text-primary dark:text-text-on-dark">تنبيه قبل رمضان</p>
            <p className="text-[11.5px] text-text-muted text-pretty">قبله بثلاثين يوماً ثم بسبعة، ما دام عليك صيام</p>
          </div>
          <Toggle checked={s.ramadan} onChange={(v) => void enable({ ramadan: v })} label="تنبيه قبل رمضان" hideLabel />
        </div>
      </Card>
      <p className="px-1 flex items-start gap-1.5 text-[11.5px] text-text-muted text-pretty">
        <ShieldCheck size={13} className="shrink-0 mt-0.5 text-teal dark:text-teal-light" />
        ما تسجّله هنا لك وحدك: لا يظهر تفصيله في الترتيب ولا في أي مكان يراه غيرك.
      </p>
    </section>
  );
}

/**
 * «قضاء ما فات» — /qada (?tab=prayers|fasts|history).
 * `embedded`: the body alone, inside «عباداتي» (/targets?tab=qada); there the
 * host owns `tab`, so the segment rides on `view` (?tab=qada&view=fasts).
 */
export function QadaPage({ embedded = false }: { embedded?: boolean }) {
  const [params, setParams] = useSearchParams();
  const key = embedded ? 'view' : 'tab';
  const raw = params.get(key) as Tab | null;
  const debts = useQadaStore((s) => s.debts);
  const fallback: Tab = debts.some((d) => d.kind === 'prayer') || !debts.some((d) => d.kind === 'fast') ? 'prayers' : 'fasts';
  const tab: Tab = raw && TABS.includes(raw) ? raw : fallback;
  const setTab = (t: Tab) =>
    setParams(
      (p) => {
        p.set(key, t);
        return p;
      },
      { replace: true },
    );
  const [adding, setAdding] = useState<'prayers' | 'fasts' | null>(null);

  // Idempotent: arms the reminders and follows the store, even without boot wiring.
  useEffect(() => {
    void rescheduleQada();
  }, []);

  const body = (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,21rem)] lg:items-start">
      <div className="flex flex-col gap-6 min-w-0">
        <QadaHero onAddPrayers={() => setAdding('prayers')} onAddFasts={() => setAdding('fasts')} />
        <Suggestions />
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'prayers', label: 'الصلوات' },
            { value: 'fasts', label: 'الصيام' },
            { value: 'history', label: 'ما قضيته' },
          ]}
        />
        {tab === 'prayers' ? <QadaPrayers /> : tab === 'fasts' ? <QadaFasts /> : <History />}
      </div>
      <aside className="flex flex-col gap-6 min-w-0 lg:sticky lg:top-24">
        <Reminders />
      </aside>
    </div>
  );

  return (
    <div className={embedded ? undefined : 'min-h-dvh bg-cream dark:bg-dark-bg'} dir="rtl">
      {embedded ? (
        body
      ) : (
        <>
          <TopAppBar title="قضاء ما فات" subtitle="خاصّ بك، لا يراه أحد" showBack />
          <div className="px-4 pt-4 pb-28 lg:px-8 lg:max-w-5xl lg:mx-auto">{body}</div>
        </>
      )}
      <AddPrayersSheet open={adding === 'prayers'} onClose={() => setAdding(null)} />
      <AddFastsSheet open={adding === 'fasts'} onClose={() => setAdding(null)} />
    </div>
  );
}

export default QadaPage;
