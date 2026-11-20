import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AlarmClock, BellOff, Check, ChevronLeft, Download, FlaskConical, HelpCircle, ShieldCheck, Smartphone } from 'lucide-react';
import { TopAppBar } from '@/components/layout/TopAppBar';
import { Card } from '@/components/ui/Card';
import { Section } from '@/components/ui/Section';
import { Toggle } from '@/components/ui/Toggle';
import { Button } from '@/components/ui/Button';
import { NumberInput } from '@/components/ui/NumberInput';
import { ArchMotif } from '@/components/ui/Ornament';
import { toast } from '@/store/toastStore';
import { toArabicDigits } from '@/utils/arabicFormat';
import { formatPrayerTime } from '@/hooks/usePrayerTimes';
import { usePrayerModeStore } from '@/store/prayerModeStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useNotificationStore } from '@/store/notificationStore';
import { fullScreenAlarm } from '@/services/notifications/fullScreenAlarm';
import { PRAYER_AR, PRAYER_ORDER, type PrayerModeSilence, type PrayerModeStart, type PrayerWindow } from '@/services/prayerModePlan';
import {
  endPrayerModeNow,
  openPolicyAccess,
  prayerModeSupport,
  startPrayerModeSync,
  testPrayerMode,
  todayWindows,
  upcomingWindows,
  type PrayerModeSupport,
} from '@/services/prayerMode';

const START_OPTIONS: { id: PrayerModeStart; label: string }[] = [
  { id: 'iqama', label: 'عند الإقامة' },
  { id: 'adhan', label: 'عند الأذان' },
  { id: 'after', label: 'بعد الأذان بـ…' },
];

const SILENCE_OPTIONS: { id: PrayerModeSilence; title: string; desc: string }[] = [
  { id: 'silent', title: 'صامت تماماً', desc: 'لا مكالمات ولا إشعارات، ويبقى المنبّه يعمل' },
  { id: 'priority', title: 'الأولوية فقط', desc: 'تمرّ المكالمات التي سمحت بها في «عدم الإزعاج»' },
];

const clock = (ms: number) => formatPrayerTime(new Date(ms));
const range = (w: PrayerWindow) => `${clock(w.start)} – ${clock(w.end)}`;

/** «وضع الصلاة» — /prayer-mode. Android silences the phone per prayer (PrayerModeReceiver.java). */
export function PrayerModePage() {
  const cfg = usePrayerModeStore();
  const male = useSettingsStore((s) => s.gender === 'male');
  const hasCoords = useSettingsStore((s) => !!s.coords);
  useSettingsStore((s) => s.timeFormat); // re-render the times on a 12/24h switch
  useNotificationStore((s) => s.prayerExtras.iqama); // …and when the iqama minutes change

  const [support, setSupport] = useState<PrayerModeSupport | null>(null);
  const [exactOk, setExactOk] = useState(true);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    setSupport(await prayerModeSupport());
    setExactOk((await fullScreenAlarm.getStatus())?.exactAlarm ?? true);
    setNow(Date.now());
  }, []);

  useEffect(() => {
    startPrayerModeSync(); // idempotent; keeps the native plan in step with edits made here
    void refresh();
    // Back from a system settings screen → the user may have just granted access.
    const onVisible = () => document.visibilityState === 'visible' && void refresh();
    document.addEventListener('visibilitychange', onVisible);
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(tick);
    };
  }, [refresh]);

  const status = support?.kind === 'android' ? support.status : null;
  const activeUntil = status?.active ? status.activeUntil : 0;
  useEffect(() => {
    if (!activeUntil) return;
    const t = setTimeout(() => void refresh(), Math.max(0, activeUntil - Date.now()) + 1500);
    return () => clearTimeout(t);
  }, [activeUntil, refresh]);

  const today = todayWindows(new Date(now));
  const next = cfg.enabled ? upcomingWindows(new Date(now)).find((w) => w.start > now) : undefined;

  const setEnabled = (on: boolean) => {
    cfg.set({ enabled: on });
    if (on && status && !status.policyAccess) toast.info('بقي إذن واحد', 'امنح «الوصول إلى عدم الإزعاج» ليعمل الوضع');
    setTimeout(() => void refresh(), 900);
  };

  const runTest = async () => {
    const err = await testPrayerMode();
    if (!err) toast.success('الهاتف صامت الآن لدقيقة', 'ويعود الصوت وحده بعدها');
    else if (err === 'no_policy_access') toast.info('امنح الإذن أولاً', '«الوصول إلى عدم الإزعاج» من قسم الأذونات');
    else if (err === 'no_exact_alarm') toast.info('فعّل المنبّهات الدقيقة أولاً', 'ليعود الصوت في دقيقته بالضبط');
    else toast.error('تعذّرت التجربة', 'أعد المحاولة بعد قليل');
    void refresh();
  };

  const endNow = async () => {
    await endPrayerModeNow();
    toast.success('عاد الصوت', 'تقبّل الله منك');
    void refresh();
  };

  return (
    <div className="min-h-dvh bg-cream dark:bg-dark-bg" dir="rtl">
      <TopAppBar title="وضع الصلاة" showBack />
      <div className="mx-auto w-full max-w-2xl px-4 pt-4 pb-28 flex flex-col gap-6">
        {/* Hero: what it does + the master switch + what happens next */}
        <Card variant="gradient-edge" className="relative overflow-hidden p-5">
          <ArchMotif className="absolute -top-3 left-2 w-24 text-gold opacity-25" />
          <div className="relative flex items-start gap-3.5">
            <span className="w-12 h-12 rounded-2xl bg-teal/12 text-teal dark:text-teal-light inline-flex items-center justify-center shrink-0">
              <BellOff size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-xl font-bold text-text-primary dark:text-text-on-dark text-balance">يصمت هاتفك وقت الصلاة</h2>
              <p className="mt-1 text-sm text-text-secondary dark:text-text-on-dark/75 text-pretty">
                عند كل صلاة يُسكت الهاتف نفسه، ثم يعود كما كان وحده.
              </p>
            </div>
            {support?.kind === 'android' ? <Toggle checked={cfg.enabled} onChange={setEnabled} label="تشغيل وضع الصلاة" hideLabel /> : null}
          </div>

          {support?.kind === 'android' ? (
            <div className="relative mt-4 rounded-[var(--radius-inner)] bg-white/70 dark:bg-dark-card/60 ring-1 ring-black/[0.04] dark:ring-white/[0.08] px-3.5 py-3 flex items-center gap-3">
              {status?.active ? (
                <>
                  <p className="flex-1 text-sm font-semibold text-teal dark:text-teal-light">
                    صامت الآن حتى <span className="font-counter tabular-nums">{clock(status.activeUntil)}</span>
                    {status.activeLabel ? ` · ${status.activeLabel}` : ''}
                  </p>
                  <Button size="sm" variant="secondary" onClick={() => void endNow()}>
                    إنهاء الآن
                  </Button>
                </>
              ) : cfg.enabled && next ? (
                <p className="flex-1 text-sm text-text-primary dark:text-text-on-dark">
                  التالي: <b>{next.label}</b> <span className="font-counter tabular-nums text-text-secondary dark:text-text-on-dark/75">{range(next)}</span>
                </p>
              ) : (
                <p className="flex-1 text-sm text-text-muted">
                  {cfg.enabled ? 'حدّد موقعك لتُحسب المواقيت' : 'مطفأ — شغّله ليبدأ مع الصلاة القادمة'}
                </p>
              )}
            </div>
          ) : null}
        </Card>

        {support?.kind === 'unsupported' ? (
          <Notice
            icon={<Smartphone size={20} />}
            title="هذه الميزة على أندرويد"
            body="وضع الصلاة يُسكت الهاتف نفسه عند كل صلاة ثم يعيده، وهذا متاح في تطبيق أندرويد فقط. افتح «رفيقي» على هاتفك وفعّله من هذه الصفحة."
          />
        ) : null}

        {support?.kind === 'outdated' ? (
          <Notice
            icon={<Download size={20} />}
            title="حدّث التطبيق"
            body="نسختك أقدم من وضع الصلاة. ثبّت أحدث نسخة من التطبيق ليعمل، فهذه الميزة تحتاج جزءاً جديداً من التطبيق لا يصل بالتحديث التلقائي."
          />
        ) : null}

        {support?.kind === 'android' && status ? (
          <>
            <Section title="الأذونات" subtitle="ليُسكت الهاتف ثم يعيده كما كان">
              <Card className="p-1.5">
                <PermRow
                  icon={<ShieldCheck size={18} />}
                  title="الوصول إلى «عدم الإزعاج»"
                  desc="يسمح بإسكات الهاتف وقت الصلاة وإعادته. لا يقرأ إشعاراتك."
                  ok={status.policyAccess}
                  onFix={() => void openPolicyAccess()}
                />
                {!exactOk ? (
                  <PermRow
                    icon={<AlarmClock size={18} />}
                    title="المنبّهات الدقيقة"
                    desc="ليبدأ الصمت وينتهي في دقيقته بالضبط"
                    ok={false}
                    onFix={() => void fullScreenAlarm.requestExactAlarm()}
                  />
                ) : null}
              </Card>
              {!status.policyAccess ? (
                <p className="px-1 text-xs text-text-muted text-pretty">
                  ستُفتح قائمة «الوصول إلى وضع عدم الإزعاج»: اختر «رَفِيقِي» وفعّله، ثم ارجع إلى هنا.
                </p>
              ) : null}
            </Section>

            <Section title="متى يبدأ الصمت">
              <div role="radiogroup" aria-label="متى يبدأ الصمت" className="grid grid-cols-3 gap-1 rounded-2xl bg-cream-dark/60 dark:bg-dark-surface p-1">
                {START_OPTIONS.map((o) => (
                  <Chip key={o.id} active={cfg.start === o.id} onClick={() => cfg.set({ start: o.id })}>
                    {o.label}
                  </Chip>
                ))}
              </div>
              {cfg.start === 'after' ? (
                <Card className="flex items-center gap-3 px-4 py-3">
                  <span className="flex-1 text-sm text-text-primary dark:text-text-on-dark">بعد الأذان بـ</span>
                  <MinutesInput value={cfg.afterMinutes} min={0} max={60} onChange={(v) => cfg.set({ afterMinutes: v })} label="دقائق بعد الأذان" />
                </Card>
              ) : (
                <p className="px-1 text-xs text-text-muted text-pretty">
                  {cfg.start === 'iqama'
                    ? 'وقت الإقامة لكل صلاة من إعداد «تنبيه الإقامة» في التنبيهات.'
                    : 'يبدأ مع الأذان مباشرة.'}
                </p>
              )}
            </Section>

            <Section title="الصلوات والمدة" subtitle="مدة الصمت لكل صلاة بالدقائق">
              <Card className="p-1.5">
                {PRAYER_ORDER.map((p, i) => {
                  const w = today.find((x) => x.prayers.some((y) => y.prayer === p));
                  const jumuahToday = !!w?.prayers.some((y) => y.prayer === p && y.name === 'الجمعة');
                  return (
                    <div key={p} className={['flex items-center gap-3 rounded-[var(--radius-inner)] px-3 py-2.5', i ? 'border-t border-black/[0.04] dark:border-white/[0.06]' : ''].join(' ')}>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-text-primary dark:text-text-on-dark">{PRAYER_AR[p]}</p>
                        <p className="text-[11px] text-text-muted font-counter tabular-nums">
                          {w ? `اليوم من ${clock(w.start)}${jumuahToday ? ' (الجمعة)' : ''}` : cfg.prayers[p].on ? '' : 'لا صمت'}
                        </p>
                      </div>
                      <MinutesInput
                        value={cfg.prayers[p].minutes}
                        min={1}
                        max={120}
                        disabled={!cfg.prayers[p].on}
                        onChange={(v) => cfg.setPrayer(p, { minutes: v })}
                        label={`مدة ${PRAYER_AR[p]} بالدقائق`}
                      />
                      <Toggle checked={cfg.prayers[p].on} onChange={(on) => cfg.setPrayer(p, { on })} label={`صمت ${PRAYER_AR[p]}`} hideLabel size="sm" />
                    </div>
                  );
                })}
              </Card>

              {male ? (
                <Card className="p-4 flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-text-primary dark:text-text-on-dark">الجمعة</p>
                      <p className="text-[11px] text-text-muted text-pretty">تحلّ محلّ الظهر يوم الجمعة: تبدأ قبل الأذان لتشمل الخطبة</p>
                    </div>
                    <Toggle checked={cfg.jumuah.on} onChange={(on) => cfg.setJumuah({ on })} label="صمت الجمعة" hideLabel size="sm" />
                  </div>
                  <div className={['grid grid-cols-2 gap-2', cfg.jumuah.on ? '' : 'opacity-50'].join(' ')}>
                    <label className="flex items-center justify-between gap-2 rounded-[var(--radius-inner)] bg-cream-dark/55 dark:bg-dark-surface px-3 py-2 text-xs text-text-secondary dark:text-text-on-dark/80">
                      قبل الأذان
                      <MinutesInput value={cfg.jumuah.before} min={0} max={90} disabled={!cfg.jumuah.on} onChange={(v) => cfg.setJumuah({ before: v })} label="دقائق قبل أذان الجمعة" />
                    </label>
                    <label className="flex items-center justify-between gap-2 rounded-[var(--radius-inner)] bg-cream-dark/55 dark:bg-dark-surface px-3 py-2 text-xs text-text-secondary dark:text-text-on-dark/80">
                      المدة
                      <MinutesInput value={cfg.jumuah.minutes} min={10} max={180} disabled={!cfg.jumuah.on} onChange={(v) => cfg.setJumuah({ minutes: v })} label="مدة صمت الجمعة بالدقائق" />
                    </label>
                  </div>
                </Card>
              ) : null}
            </Section>

            <Section title="درجة الصمت">
              <div role="radiogroup" aria-label="درجة الصمت" className="grid grid-cols-2 gap-2.5">
                {SILENCE_OPTIONS.map((o) => {
                  const on = cfg.silence === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => cfg.set({ silence: o.id })}
                      className={[
                        'text-start rounded-[var(--radius-inner)] p-3.5 min-h-11 transition-colors duration-200 ring-1',
                        on
                          ? 'bg-teal/10 dark:bg-teal/15 ring-teal/40'
                          : 'bg-white dark:bg-dark-card ring-black/[0.05] dark:ring-white/[0.07] hover:bg-teal/5',
                      ].join(' ')}
                    >
                      <span className="flex items-center gap-1.5 text-sm font-bold text-text-primary dark:text-text-on-dark">
                        {on ? <Check size={15} strokeWidth={3} className="text-teal dark:text-teal-light" /> : null}
                        {o.title}
                      </span>
                      <span className="mt-1 block text-[11px] leading-snug text-text-muted text-pretty">{o.desc}</span>
                    </button>
                  );
                })}
              </div>
            </Section>

            <Section title="بعد الصلاة">
              <Card className="p-1.5">
                <div className="flex items-center gap-3 rounded-[var(--radius-inner)] px-3 py-3">
                  <span className="w-9 h-9 rounded-xl bg-teal/10 text-teal dark:text-teal-light inline-flex items-center justify-center shrink-0">
                    <HelpCircle size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-text-primary dark:text-text-on-dark">اسألني: هل صلّيت؟</p>
                    <p className="text-[11px] text-text-muted text-pretty">
                      {male ? 'إشعار بزرّي «صلّيت» و«في المسجد» يسجّلها في يومك' : 'إشعار بزرّ «صلّيت» يسجّلها في يومك'}
                    </p>
                  </div>
                  <Toggle checked={cfg.ask} onChange={(ask) => cfg.set({ ask })} label="اسألني بعد الصلاة" hideLabel size="sm" />
                </div>
              </Card>
              <Button variant="secondary" fullWidth leftIcon={<FlaskConical size={17} />} onClick={() => void runTest()} disabled={status.active}>
                جرّب الآن (دقيقة واحدة)
              </Button>
            </Section>
          </>
        ) : null}

        {support?.kind !== 'unsupported' && support?.kind !== 'outdated' ? (
          <Section title="مواعيد اليوم" subtitle={cfg.enabled ? undefined : 'معاينة، والوضع مطفأ'}>
            <Card className="p-1.5">
              {!hasCoords ? (
                <p className="px-3 py-4 text-sm text-text-muted">حدّد موقعك من الإعدادات لتظهر مواعيد الصمت.</p>
              ) : today.length === 0 ? (
                <p className="px-3 py-4 text-sm text-text-muted">لا صمت اليوم: كل الصلوات مطفأة.</p>
              ) : (
                today.map((w, i) => {
                  const state = w.end <= now ? 'done' : w.start <= now ? 'now' : 'next';
                  return (
                    <div key={w.start} className={['flex items-center gap-3 rounded-[var(--radius-inner)] px-3 py-3', i ? 'border-t border-black/[0.04] dark:border-white/[0.06]' : ''].join(' ')}>
                      <span
                        aria-hidden
                        className={[
                          'w-2.5 h-2.5 rounded-full shrink-0',
                          state === 'now' ? 'bg-teal ring-4 ring-teal/20' : state === 'next' ? 'bg-gold' : 'bg-text-muted/40',
                        ].join(' ')}
                      />
                      <p className={['flex-1 text-sm font-semibold', state === 'done' ? 'text-text-muted' : 'text-text-primary dark:text-text-on-dark'].join(' ')}>{w.label}</p>
                      <p className={['text-sm font-counter tabular-nums', state === 'done' ? 'text-text-muted' : 'text-text-secondary dark:text-text-on-dark/80'].join(' ')}>{range(w)}</p>
                      <span
                        className={[
                          'text-[11px] font-bold rounded-full px-2 py-0.5 shrink-0',
                          state === 'now' ? 'bg-teal/12 text-teal dark:text-teal-light' : state === 'next' ? 'bg-gold/15 text-gold-dark dark:text-gold-light' : 'text-text-muted',
                        ].join(' ')}
                      >
                        {state === 'now' ? 'الآن' : state === 'next' ? 'قادم' : 'انتهى'}
                      </span>
                    </div>
                  );
                })
              )}
            </Card>
          </Section>
        ) : null}

        <Card variant="inset" className="p-5 flex flex-col gap-3">
          <h3 className="font-ornate text-lg font-bold text-text-primary dark:text-text-on-dark text-center">الخشوع</h3>
          <p className="font-quran text-[21px] leading-[2.1] text-center text-teal-dark dark:text-teal-light text-balance">
            ﴿قَدْ أَفْلَحَ الْمُؤْمِنُونَ ۝ الَّذِينَ هُمْ فِي صَلَاتِهِمْ خَاشِعُونَ﴾
          </p>
          <p className="text-[11px] text-text-muted text-center">[المؤمنون: {toArabicDigits('1–2')}]</p>
          <p className="text-sm leading-relaxed text-text-secondary dark:text-text-on-dark/80 text-pretty">
            وقال النبي ﷺ: «إنّ في الصلاة شُغلاً» (متفق عليه). إسكات الهاتف عونٌ على حضور القلب، والخشوع روح الصلاة: أن تقف بين يدي الله فارغ البال مما سواه.
          </p>
        </Card>
      </div>
    </div>
  );
}

function Notice({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <Card className="p-4 flex items-start gap-3">
      <span className="w-10 h-10 rounded-xl bg-gold/15 text-gold-dark dark:text-gold-light inline-flex items-center justify-center shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[15px] font-bold text-text-primary dark:text-text-on-dark">{title}</p>
        <p className="mt-1 text-sm text-text-secondary dark:text-text-on-dark/80 text-pretty">{body}</p>
      </div>
    </Card>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={[
        'min-h-11 rounded-xl px-2 text-[13px] font-semibold transition-colors duration-200',
        active ? 'bg-white dark:bg-dark-card shadow-[var(--shadow-xs)] text-teal dark:text-teal-light' : 'text-text-secondary dark:text-text-on-dark/70',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function MinutesInput({
  value,
  onChange,
  min,
  max,
  label,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  label: string;
  disabled?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1 shrink-0">
      <NumberInput
        value={value}
        onValueChange={onChange}
        min={min}
        max={max}
        disabled={disabled}
        aria-label={label}
        className="w-12 h-9 rounded-xl bg-white dark:bg-dark-card text-center text-sm font-bold font-counter tabular-nums text-text-primary dark:text-text-on-dark ring-1 ring-black/8 dark:ring-white/10 focus:outline-none focus:ring-2 focus:ring-teal/50 disabled:opacity-50"
      />
      <span className="text-xs text-text-muted">د</span>
    </span>
  );
}

function PermRow({ icon, title, desc, ok, onFix }: { icon: ReactNode; title: string; desc: string; ok: boolean; onFix: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-inner)] px-3 py-3">
      <span
        className={[
          'w-9 h-9 rounded-xl inline-flex items-center justify-center shrink-0',
          ok ? 'bg-teal/12 text-teal dark:text-teal-light' : 'bg-gold/15 text-gold-dark dark:text-gold-light',
        ].join(' ')}
      >
        {ok ? <Check size={18} strokeWidth={2.4} /> : icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text-primary dark:text-text-on-dark">{title}</p>
        <p className="text-[11px] text-text-muted leading-snug text-pretty">{desc}</p>
      </div>
      {ok ? (
        <span className="text-[11px] font-bold text-teal dark:text-teal-light shrink-0">ممنوح</span>
      ) : (
        <Button size="sm" onClick={onFix} rightIcon={<ChevronLeft size={14} />}>
          منح الإذن
        </Button>
      )}
    </div>
  );
}
