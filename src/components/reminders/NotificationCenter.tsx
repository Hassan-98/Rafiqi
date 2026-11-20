import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  AlarmClock, BellOff, BellRing, BookOpen, CalendarDays, CalendarCheck, Check, ChevronDown, ChevronLeft, Flame, GraduationCap, HandHeart, Minus,
  Moon, MoonStar, Plus, Smartphone, Sparkles, Star, Sun, Sunrise, Sunset, SunDim, SunMedium, Target, Trash2, Volume2, X,
  BookOpenText, Hourglass, Trophy, Crown, Wand2, Coffee, BedDouble,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Mosque } from '@/components/icons/Mosque';
import { Card } from '@/components/ui/Card';
import { Toggle } from '@/components/ui/Toggle';
import { Button } from '@/components/ui/Button';
import { Medallion, SectionTitle } from '@/components/ui/Ornament';
import { SoundSelector } from '@/components/settings/SoundPicker';
import {
  useNotificationStore,
  SMART_DEFAULTS,
  PRAYER_REMINDER_KEYS,
  FIXED_TIME_KEYS,
  type ModuleReminderConfig,
  type PrayerExtraConfig,
  iqamaMinutes,
} from '@/store/notificationStore';
import type { PrayerName } from '@/types';
import { useCustomRemindersStore, SECTION_LABEL } from '@/store/customRemindersStore';
import { useTargetsStore } from '@/store/targetsStore';
import { useSettingsStore } from '@/store/settingsStore';
import { qiyamNightKey } from '@/store/qiyamStore';
import { prayerTimeNotificationScheduler, minutesAr, PRAYER_NAMES_AR } from '@/services/PrayerTimeNotificationScheduler';
import { NumberInput } from '@/components/ui/NumberInput';
import { PRAYERS_ORDER } from '@/store/prayerLogStore';
import { notificationService } from '@/services/NotificationService';
import { nightWindow, previewSmartNotifications } from '@/services/smartNotifications';
import { defaultSoundForKey, getSoundDef, type SoundKey } from '@/services/notifications/sounds';
import { fullScreenAlarm } from '@/services/notifications/fullScreenAlarm';
import { pickCustomSound } from '@/services/customSound';
import { hapticsService } from '@/services/HapticsService';
import { formatPrayerTime } from '@/hooks/usePrayerTimes';
import { toArabicDigits } from '@/utils/arabicFormat';
import { toast } from '@/store/toastStore';
import { InspirationSettings } from '@/components/inspiration/InspirationSettings';
import { useNotificationHealth, type HealthCheck } from './useNotificationHealth';
import { UpcomingTimeline, usePendingNotifications } from './UpcomingTimeline';
import { useAttentionStore } from '@/store/attentionStore';
import { muteLabel } from '@/services/dayAttention';
import { CompanionEase } from './CompanionEase';

/**
 * «الإشعارات» — the whole notification experience in one place:
 *  1. status (will reminders actually arrive? each OS gate with a one-tap fix)
 *  2. «القادم» — what the device will ring next, read from the OS
 *  3. grouped reminder settings (toggle · time · ringtone · full-screen)
 *  4. smart notifications + quiet hours, personal reminders, tools.
 * Props-less; renders a fragment of sections (drop into any gap-6 stack).
 */

const PRAYER_META: Record<string, { label: string; Icon: LucideIcon }> = {
  'prayers.fajr': { label: 'الفجر', Icon: Sunrise },
  'prayers.dhuhr': { label: 'الظهر', Icon: Sun },
  'prayers.asr': { label: 'العصر', Icon: SunDim },
  'prayers.maghrib': { label: 'المغرب', Icon: Sunset },
  'prayers.isha': { label: 'العشاء', Icon: MoonStar },
};

/** "HH:mm" → the user's clock format with Arabic digits («٦:٣٠ ص»). */
function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date();
  d.setHours(h || 0, m || 0, 0, 0);
  return formatPrayerTime(d);
}

const soundName = (c: { soundKey?: SoundKey; customLabel?: string }, fallback: SoundKey) =>
  c.customLabel ?? getSoundDef(c.soundKey ?? fallback).labelAr;

/** Row header: chip · title/summary · chevron — tapping expands the details line. */
function RowHead({
  Icon,
  on,
  tone,
  label,
  summary,
  open,
  onOpen,
}: {
  Icon: LucideIcon | typeof Mosque;
  on: boolean;
  tone?: 'teal' | 'gold';
  label: string;
  summary: string;
  open: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!on}
      aria-expanded={on ? open : undefined}
      className="flex-1 min-w-0 flex items-center gap-3 text-start disabled:cursor-default"
    >
      <Chip Icon={Icon} on={on} tone={tone} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-text-primary dark:text-text-on-dark">{label}</span>
        <span className="block text-[11px] text-text-muted leading-relaxed text-pretty">{summary}</span>
      </span>
      {on ? (
        <ChevronDown
          size={16}
          aria-hidden
          className={`text-text-muted shrink-0 transition-transform duration-200 ease-out-soft ${open ? 'rotate-180' : ''}`}
        />
      ) : null}
    </button>
  );
}

// ── store glue ─────────────────────────────────────────────────────────────

function useConfig(key: string): ModuleReminderConfig {
  const stored = useNotificationStore((s) => s.configs[key]);
  const getConfig = useNotificationStore((s) => s.getConfig);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => getConfig(key), [stored, getConfig, key]);
}

/** Persist a patch and re-arm exactly what depends on it. */
function applyConfig(key: string, patch: Partial<ModuleReminderConfig>): void {
  const st = useNotificationStore.getState();
  st.setConfig(key, patch);
  if (key.startsWith('prayers.')) {
    void prayerTimeNotificationScheduler.reschedule();
  } else if ((FIXED_TIME_KEYS as readonly string[]).includes(key)) {
    st.cancelModule(key);
    st.scheduleModule(key);
  }
  // fasting / special: main.tsx re-runs their schedulers on any change.
}

function applyExtra(which: 'pre' | 'iqama', patch: Partial<PrayerExtraConfig>): void {
  useNotificationStore.getState().setPrayerExtra(which, patch);
  void prayerTimeNotificationScheduler.reschedule();
}

let iqamaTimer: ReturnType<typeof setTimeout> | null = null;

/** «اقتربت الإقامة» per prayer — each mosque sets its own iqama. Typing
 *  saves at once; the notifications re-arm once typing pauses. */
function IqamaTimes() {
  const cfg = useNotificationStore((s) => s.prayerExtras.iqama);
  const set = (p: PrayerName, v: number) => {
    useNotificationStore.getState().setPrayerExtra('iqama', { perPrayer: { ...cfg.perPrayer, [p]: v } });
    if (iqamaTimer) clearTimeout(iqamaTimer);
    iqamaTimer = setTimeout(() => void prayerTimeNotificationScheduler.reschedule(), 800);
  };
  return (
    <div className="w-full flex flex-col gap-2">
      <p className="text-[11px] text-text-muted text-pretty">بعد الأذان بكم دقيقة تُقام كل صلاة في مسجدك؟</p>
      <div className="grid grid-cols-5 gap-1.5">
        {PRAYERS_ORDER.map((p) => (
          <label key={p} className="flex flex-col items-center gap-1">
            <span className="text-[11px] font-semibold text-text-secondary dark:text-text-on-dark/80">{PRAYER_NAMES_AR[p]}</span>
            <NumberInput
              value={iqamaMinutes(cfg, p)}
              min={1}
              max={90}
              onValueChange={(v) => set(p, v)}
              aria-label={`إقامة ${PRAYER_NAMES_AR[p]} بعد الأذان بالدقائق`}
              className="w-full h-10 rounded-xl text-center font-counter font-bold text-sm bg-cream-dark/60 dark:bg-dark-surface text-text-primary dark:text-text-on-dark ring-1 ring-black/[0.05] dark:ring-white/[0.07] focus:outline-none focus:ring-2 focus:ring-teal/50"
            />
            <span className="text-[10px] text-text-muted">دقيقة</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ── building blocks ────────────────────────────────────────────────────────

function Chip({ Icon, on, tone = 'teal' }: { Icon: LucideIcon | typeof Mosque; on: boolean; tone?: 'teal' | 'gold' }) {
  const cls = !on
    ? 'bg-cream-dark/70 dark:bg-dark-surface text-text-muted'
    : tone === 'gold'
      ? 'bg-gold/15 text-gold-dark dark:text-gold-light'
      : 'bg-teal/10 text-teal dark:bg-teal/15 dark:text-teal-light';
  return (
    <span className={`w-9 h-9 rounded-xl inline-flex items-center justify-center shrink-0 transition-colors ${cls}`}>
      <Icon size={17} />
    </span>
  );
}

function Group({ children }: { children: ReactNode }) {
  return <Card className="p-1.5 divide-y divide-black/[0.05] dark:divide-white/[0.06]">{children}</Card>;
}

function Section({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle title={title} subtitle={subtitle} action={action} />
      {children}
    </section>
  );
}

function TimeInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <input
      type="time"
      value={value}
      aria-label={label}
      onChange={(e) => e.target.value && onChange(e.target.value)}
      className="h-9 rounded-xl bg-cream-dark/60 dark:bg-dark-surface text-teal dark:text-teal-light px-2 text-xs font-counter tabular-nums focus:outline-none focus:ring-2 focus:ring-teal/40"
      dir="ltr"
    />
  );
}

function FullScreenChip({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-label="تنبيه ملء الشاشة"
      aria-pressed={on}
      title="يملأ الشاشة كمكالمة واردة ويوقظ الجهاز"
      onClick={onToggle}
      className={[
        'h-9 px-2.5 rounded-xl inline-flex items-center gap-1 text-[11px] font-bold transition-colors shrink-0',
        on
          ? 'bg-[image:var(--gradient-teal)] text-on-accent'
          : 'bg-cream-dark/60 dark:bg-dark-surface text-text-muted hover:text-teal',
      ].join(' ')}
    >
      <Smartphone size={14} /> ملء الشاشة
    </button>
  );
}

/**
 * One reminder: chip · title/hint · switch; when on, a second line with the
 * time (fixed-time reminders), the ringtone and the full-screen option.
 */
function ReminderRow({
  cfgKey,
  label,
  Icon,
  hint,
  showTime = true,
  fullScreen = true,
  tone,
  children,
}: {
  cfgKey: string;
  label: string;
  Icon: LucideIcon | typeof Mosque;
  hint: (cfg: ModuleReminderConfig) => ReactNode;
  showTime?: boolean;
  fullScreen?: boolean;
  tone?: 'teal' | 'gold';
  children?: ReactNode;
}) {
  const cfg = useConfig(cfgKey);
  const [open, setOpen] = useState(false);
  const summary = cfg.enabled
    ? [hint(cfg), soundName(cfg, defaultSoundForKey(cfgKey)), fullScreen && cfg.fullScreen ? 'ملء الشاشة' : null]
        .filter(Boolean)
        .join(' · ')
    : 'متوقّف';
  return (
    <div className="px-3 py-3">
      <div className="flex items-center gap-3">
        <RowHead Icon={Icon} on={cfg.enabled} tone={tone} label={label} summary={summary} open={open} onOpen={() => setOpen((v) => !v)} />
        <Toggle checked={cfg.enabled} onChange={(v) => applyConfig(cfgKey, { enabled: v })} size="sm" label={label} hideLabel />
      </div>
      {cfg.enabled && open ? (
        <div className="flex flex-wrap items-center gap-2 mt-2.5 ps-12">
          {showTime ? <TimeInput value={cfg.time} label={`وقت ${label}`} onChange={(time) => applyConfig(cfgKey, { time })} /> : null}
          <SoundSelector
            value={cfg.soundKey ?? defaultSoundForKey(cfgKey)}
            customLabel={cfg.customLabel}
            ariaLabel={`نغمة ${label}`}
            onChange={(soundKey) => applyConfig(cfgKey, { soundKey, customChannelId: undefined, customLabel: undefined })}
            onPickCustom={async () => {
              const res = await pickCustomSound(cfgKey, `تنبيه ${label}`);
              if (res) applyConfig(cfgKey, { customChannelId: res.channelId, customLabel: res.label });
            }}
          />
          {fullScreen ? <FullScreenChip on={!!cfg.fullScreen} onToggle={() => applyConfig(cfgKey, { fullScreen: !cfg.fullScreen })} /> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

function MinutesStepper({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const step = (d: number) => {
    const next = Math.max(5, Math.min(60, Math.round((value + d) / 5) * 5));
    if (next !== value) {
      void hapticsService.selection();
      onChange(next);
    }
  };
  const btn =
    'w-9 h-9 rounded-xl inline-flex items-center justify-center bg-cream-dark/60 dark:bg-dark-surface text-teal dark:text-teal-light disabled:opacity-40';
  return (
    <div className="inline-flex items-center gap-1" role="group" aria-label={label}>
      <button type="button" className={btn} onClick={() => step(-5)} disabled={value <= 5} aria-label="أقل بخمس دقائق">
        <Minus size={14} />
      </button>
      <span className="min-w-[4.5rem] text-center text-xs font-bold font-counter tabular-nums text-text-primary dark:text-text-on-dark">
        {minutesAr(value)}
      </span>
      <button type="button" className={btn} onClick={() => step(5)} disabled={value >= 60} aria-label="أكثر بخمس دقائق">
        <Plus size={14} />
      </button>
    </div>
  );
}

function PrayerExtraRow({ which, label, Icon, before }: { which: 'pre' | 'iqama'; label: string; Icon: LucideIcon | typeof Mosque; before: boolean }) {
  const cfg = useNotificationStore((s) => s.prayerExtras[which]);
  const [open, setOpen] = useState(false);
  const perPrayer = which === 'iqama' && Object.keys(cfg.perPrayer ?? {}).length > 0;
  const summary = cfg.enabled
    ? `${perPrayer ? 'بعد الأذان بوقت كل صلاة' : `${before ? 'قبل الأذان' : 'بعد الأذان'} بـ${minutesAr(cfg.minutes)}`} · ${soundName(cfg, which === 'pre' ? 'adhan_short' : 'iqama')}`
    : 'متوقّف';
  return (
    <div className="px-3 py-3">
      <div className="flex items-center gap-3">
        <RowHead Icon={Icon} on={cfg.enabled} label={label} summary={summary} open={open} onOpen={() => setOpen((v) => !v)} />
        <Toggle checked={cfg.enabled} onChange={(v) => applyExtra(which, { enabled: v })} size="sm" label={label} hideLabel />
      </div>
      {cfg.enabled && open ? (
        <div className="flex flex-wrap items-center gap-2 mt-2.5 ps-12">
          {which === 'iqama' ? (
            <IqamaTimes />
          ) : (
            <MinutesStepper value={cfg.minutes} label={`${label} — المدة`} onChange={(minutes) => applyExtra(which, { minutes })} />
          )}
          <span className="flex-1" />
          <SoundSelector
            value={cfg.soundKey ?? (which === 'pre' ? 'adhan_short' : 'iqama')}
            customLabel={cfg.customLabel}
            ariaLabel={`نغمة ${label}`}
            onChange={(soundKey) => applyExtra(which, { soundKey, customChannelId: undefined, customLabel: undefined })}
            onPickCustom={async () => {
              const res = await pickCustomSound(`prayers.${which}`, label);
              if (res) applyExtra(which, { customChannelId: res.channelId, customLabel: res.label });
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function LinkRow({ Icon, title, hint, to }: { Icon: LucideIcon; title: string; hint: string; to: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      className="w-full flex items-center gap-3 px-3 py-3 rounded-[var(--radius-inner)] text-start hover:bg-teal/5 transition-colors"
    >
      <Chip Icon={Icon} on />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-text-primary dark:text-text-on-dark">{title}</span>
        <span className="block text-[11px] text-text-muted truncate">{hint}</span>
      </span>
      <ChevronLeft size={16} className="text-text-muted shrink-0" />
    </button>
  );
}

type SmartToggle = 'streak' | 'weekly' | 'celebrate' | 'prayerCheck' | 'adhkarNudges' | 'wirdNudges' | 'challenges' | 'lateCalls' | 'suggestions' | 'brief' | 'wrapup' | 'race';

/** «رفيقك اليومي» is on and has prayer times to work with — the fixed reminder of this row steps aside. */
function useCompanionCovers(k: 'adhkarNudges' | 'wirdNudges'): boolean {
  const on = useNotificationStore((s) => ({ ...SMART_DEFAULTS, ...s.smart })[k]);
  const coords = useSettingsStore((s) => !!s.coords);
  return on && coords;
}

/** What «رفيقك اليومي» has lined up next — proof it reads the day, not a timetable. */
function SmartUpcoming() {
  const smart = useNotificationStore((s) => s.smart);
  const configs = useNotificationStore((s) => s.configs);
  const coords = useSettingsStore((s) => s.coords);
  const [stamp] = useState(() => Date.now());
  const list = useMemo(() => {
    try {
      return previewSmartNotifications().slice(0, 4);
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [smart, configs, coords, stamp]);
  if (!coords) {
    return <p className="px-3 pb-3 text-[11px] text-text-muted text-pretty">حدّد موقعك ليعمل الرفيق بمواقيت الصلاة.</p>;
  }
  if (list.length === 0) return <p className="px-3 pb-3 text-[11px] text-text-muted">لا شيء بانتظارك الآن، تقبّل الله منك.</p>;
  const day = (d: Date) => {
    const t = new Date();
    const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date(t).setHours(0, 0, 0, 0)) / 86_400_000);
    return diff === 0 ? 'اليوم' : diff === 1 ? 'غداً' : 'بعد غد';
  };
  return (
    <div className="px-3 pb-3">
      <p className="text-[11px] font-bold text-text-muted mb-1.5">القادم من رفيقك</p>
      <ul className="flex flex-col gap-1.5">
        {list.map((n) => (
          <li key={n.id} className="rounded-[var(--radius-inner)] bg-cream-dark/45 dark:bg-dark-surface px-3 py-2">
            <p className="flex items-baseline justify-between gap-2">
              <span className="text-[12.5px] font-bold text-text-primary dark:text-text-on-dark truncate">{n.title}</span>
              <span className="shrink-0 text-[10.5px] font-counter tabular-nums text-teal dark:text-teal-light">
                {day(n.at)} {toArabicDigits(formatPrayerTime(n.at))}
              </span>
            </p>
            <p className="text-[11px] text-text-muted leading-relaxed line-clamp-2">{n.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Restores the sunnah muted with «لا تقترحها» on Home. */
function MutedSuggestions() {
  const muted = useAttentionStore((s) => s.muted);
  const unmuteAll = useAttentionStore((s) => s.unmuteAll);
  if (!muted.length) return null;
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <p className="min-w-0 flex-1 ps-12 text-[11px] text-text-muted text-pretty">
        أخفيتَ {muted.length === 1 ? 'اقتراحاً واحداً' : muted.length === 2 ? 'اقتراحين' : `${toArabicDigits(muted.length)} اقتراحات`}:{' '}
        {muted.map(muteLabel).join('، ')}
      </p>
      <button type="button" onClick={unmuteAll} className="shrink-0 min-h-9 px-2 text-xs font-semibold text-teal dark:text-teal-light">
        إعادتها
      </button>
    </div>
  );
}

function SmartRow({ k, title, body, Icon }: { k: SmartToggle; title: string; body: string; Icon: LucideIcon }) {
  const on = useNotificationStore((s) => (s.smart ?? SMART_DEFAULTS)[k] ?? SMART_DEFAULTS[k]);
  const setSmart = useNotificationStore((s) => s.setSmart);
  return (
    <div className="flex items-center gap-3 px-3 py-3">
      <Chip Icon={Icon} on={on} tone="gold" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text-primary dark:text-text-on-dark">{title}</p>
        <p className="text-[11px] text-text-muted leading-relaxed text-pretty">{body}</p>
      </div>
      <Toggle checked={on} onChange={(v) => setSmart({ [k]: v })} size="sm" label={title} hideLabel />
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-2xl bg-cream-dark/60 dark:bg-dark-surface p-1">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => !on && onChange(o.id)}
            className={[
              'flex-1 min-h-10 px-2 rounded-xl text-[12.5px] font-semibold transition-colors duration-200',
              on
                ? 'bg-white dark:bg-dark-card shadow-[var(--shadow-xs)] text-teal dark:text-teal-light'
                : 'text-text-secondary dark:text-text-on-dark/70 hover:text-teal',
            ].join(' ')}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── status card ────────────────────────────────────────────────────────────

function HealthRow({ c }: { c: HealthCheck }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <span
        className={[
          'w-8 h-8 rounded-xl inline-flex items-center justify-center shrink-0',
          c.blocking ? 'bg-danger/12 text-danger' : 'bg-warning/15 text-warning',
        ].join(' ')}
      >
        <X size={15} strokeWidth={2.6} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-text-primary dark:text-text-on-dark">{c.title}</p>
        <p className="text-[11px] text-text-muted leading-snug text-pretty">{c.desc}</p>
      </div>
      <Button variant={c.blocking ? 'primary' : 'soft'} size="sm" onClick={() => void c.fix()}>
        {c.action}
      </Button>
    </div>
  );
}

function StatusCard({
  health,
  next,
  onTest,
}: {
  health: ReturnType<typeof useNotificationHealth>;
  next: { title: string; at: Date } | null;
  onTest: () => void;
}) {
  const { platform, checks, blockingIssues, advisories, nativeMissing, loaded } = health;
  const failing = checks.filter((c) => !c.ok);
  const passing = checks.filter((c) => c.ok);
  const state = platform === 'web' ? 'web' : blockingIssues > 0 ? 'blocked' : advisories > 0 ? 'advice' : 'ok';
  const headline = {
    web: 'التنبيهات على جهازك',
    blocked: 'تنبيهاتك لن تصل في وقتها',
    advice: 'بقيت خطوة لموثوقية أعلى',
    ok: 'التنبيهات جاهزة',
  }[state];
  const sub = {
    web: 'تعمل التنبيهات على تطبيق أندرويد وتطبيق سطح المكتب. الإعدادات هنا تُحفظ وتُطبَّق هناك.',
    blocked: 'أصلح ما يلي ليصلك الأذان والتذكير في وقته.',
    advice: 'تصلك التنبيهات، وهذه الإعدادات تحميها من إسكات النظام.',
    ok: platform === 'desktop' ? 'تصل ما دام التطبيق مفتوحاً على سطح المكتب.' : 'كل الأذونات ممنوحة، والتطبيق يعيد الجدولة كلما فتحته.',
  }[state];

  return (
    <Card variant="gradient-edge" className="p-4 flex flex-col gap-3" aria-live="polite">
      <div className="flex items-center gap-3.5">
        <Medallion size={52} tone={state === 'blocked' ? 'gold' : 'teal'}>
          {state === 'ok' ? <Check size={20} strokeWidth={2.6} /> : state === 'web' ? <Smartphone size={19} /> : <BellRing size={19} />}
        </Medallion>
        <div className="min-w-0 flex-1">
          <h2 className="font-display font-bold text-[17px] text-text-primary dark:text-text-on-dark text-balance">{headline}</h2>
          <p className="text-xs text-text-secondary dark:text-text-on-dark/70 leading-relaxed text-pretty mt-0.5">{sub}</p>
        </div>
      </div>

      {next ? (
        <div className="rounded-[var(--radius-inner)] bg-white/70 dark:bg-dark-card/70 ring-1 ring-black/[0.04] dark:ring-white/[0.06] px-3 py-2.5 flex items-center gap-2.5">
          <AlarmClock size={15} className="text-gold shrink-0" />
          <span className="text-[11px] text-text-muted shrink-0">التالي</span>
          <span className="flex-1 min-w-0 truncate text-[13px] font-semibold text-text-primary dark:text-text-on-dark">{next.title}</span>
          <span className="shrink-0 font-counter tabular-nums text-[13px] font-bold text-teal dark:text-teal-light">
            {toArabicDigits(formatPrayerTime(next.at))}
          </span>
        </div>
      ) : null}

      {nativeMissing ? (
        <p className="text-[11px] text-danger leading-relaxed text-pretty">
          بعض ميزات التنبيه أصلية في أندرويد وغير موجودة في النسخة المثبّتة — ثبّت آخر نسخة من التطبيق.
        </p>
      ) : null}

      {loaded && failing.length ? (
        <div className="rounded-[var(--radius-inner)] bg-white/70 dark:bg-dark-card/70 ring-1 ring-black/[0.04] dark:ring-white/[0.06] divide-y divide-black/[0.05] dark:divide-white/[0.06]">
          {failing.map((c) => (
            <HealthRow key={c.id} c={c} />
          ))}
        </div>
      ) : null}

      {passing.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="ما هو جاهز">
          {passing.map((c) => (
            <li
              key={c.id}
              className="inline-flex items-center gap-1 rounded-full bg-teal/10 dark:bg-teal/15 text-teal dark:text-teal-light px-2.5 py-1 text-[11px] font-semibold"
            >
              <Check size={11} strokeWidth={3} />
              {c.title}
            </li>
          ))}
        </ul>
      ) : null}

      {platform !== 'web' ? (
        <Button variant="gold" fullWidth leftIcon={<Volume2 size={16} />} onClick={onTest}>
          جرّب تنبيه الأذان (خلال ٥ ثوانٍ)
        </Button>
      ) : null}
    </Card>
  );
}

// ── the center ─────────────────────────────────────────────────────────────

export function NotificationCenter() {
  const configs = useNotificationStore((s) => s.configs);
  const storedSmart = useNotificationStore((s) => s.smart);
  const smart = useMemo(() => ({ ...SMART_DEFAULTS, ...storedSmart }), [storedSmart]);
  const setSmart = useNotificationStore((s) => s.setSmart);
  const targets = useTargetsStore((s) => s.targets);
  const habits = useSettingsStore((s) => s.customHabits);
  const coords = useSettingsStore((s) => s.coords);
  const customs = useCustomRemindersStore((s) => s.reminders);
  const removeCustom = useCustomRemindersStore((s) => s.remove);
  const qiyamCfg = useConfig('qiyam');
  const fastingCfg = useConfig('fasting');

  const needFullScreen =
    Object.values(configs).some((c) => c?.enabled && c.fullScreen) || targets.some((t) => t.reminderEnabled && t.fullScreen);
  const health = useNotificationHealth({ needFullScreen });
  const { items, refresh } = usePendingNotifications();
  const supported = health.platform !== 'web';

  const awradOn = targets.filter((t) => t.reminderEnabled && !t.completedAt).length;
  const habitsOn = habits.filter((h) => h.reminder?.enabled).length;
  const lastThird = useMemo(() => (coords ? nightWindow(qiyamNightKey(new Date()))?.lastThird ?? null : null), [coords]);
  const qiyamSmart = smart.qiyam;
  const adhkarSmart = useCompanionCovers('adhkarNudges');
  const wirdSmart = useCompanionCovers('wirdNudges');

  const next = items && items.length ? { title: items[0].title, at: items[0].at } : null;
  const studyArmed = (items ?? []).filter((n) => n.id.startsWith('myzikr_study_'));
  const tasksArmed = studyArmed.filter((n) => n.id.startsWith('myzikr_study_task_')).length;

  const testAlarm = async () => {
    const ok = await notificationService.requestPermission();
    if (!ok) {
      toast.error('فعّل إذن الإشعارات أولاً');
      void health.refresh();
      return;
    }
    const fajr = useNotificationStore.getState().getConfig('prayers.fajr');
    try {
      await notificationService.scheduleNotification({
        // Stable id: each test overwrites the last instead of piling up.
        id: 'myzikr_test',
        title: 'تجربة التنبيه 🔔',
        body: 'هكذا سيُنبّهك التطبيق عند وقت الصلاة',
        triggerTime: new Date(Date.now() + 5000).toISOString(),
        repeatInterval: 'none',
        moduleId: 'test',
        deepLinkPath: '/#/settings?tab=notifications',
        soundKey: fajr.soundKey ?? 'adhan_makkah',
        customChannelId: fajr.customChannelId,
      });
      toast.success('سيرنّ التنبيه خلال ٥ ثوانٍ', 'أغلق الشاشة لتسمعه كما سيصلك');
      setTimeout(() => void refresh(), 800);
    } catch {
      toast.error('تعذّر جدولة التجربة');
    }
  };

  const applyPreset = (preset: 'morning' | 'evening' | 'off') => {
    const st = useNotificationStore.getState();
    for (const key of FIXED_TIME_KEYS) {
      // الضحى has its own window (after sunrise): 06:00 / 18:00 would miss it.
      if (key === 'duha' && preset !== 'off') continue;
      if (preset === 'off') st.setConfig(key, { enabled: false });
      else st.setConfig(key, { enabled: true, time: preset === 'morning' ? '06:00' : '18:00' });
      st.cancelModule(key);
      st.scheduleModule(key);
    }
    if (preset === 'off') {
      PRAYER_REMINDER_KEYS.forEach((key) => st.setConfig(key, { enabled: false }));
      st.setPrayerExtra('pre', { enabled: false });
      st.setPrayerExtra('iqama', { enabled: false });
      void prayerTimeNotificationScheduler.reschedule();
    }
    toast.success(preset === 'off' ? 'أُوقفت كل التذكيرات' : `ضُبطت التذكيرات ${preset === 'morning' ? 'صباحاً' : 'مساءً'}`);
  };

  return (
    <>
      <StatusCard health={health} next={next} onTest={() => void testAlarm()} />

      <Section title="القادم" subtitle="ما سيرنّ على جهازك، بترتيب الوقت">
        <UpcomingTimeline items={supported ? items : null} onRefresh={() => void refresh()} supported={supported} />
      </Section>

      <Section title="الصلاة والأذان" subtitle="عند دخول الوقت بحسب موقعك وطريقة الحساب">
        <Group>
          {PRAYER_REMINDER_KEYS.map((key) => (
            <ReminderRow
              key={key}
              cfgKey={key}
              label={PRAYER_META[key].label}
              Icon={PRAYER_META[key].Icon}
              showTime={false}
              hint={() => 'عند الأذان'}
            />
          ))}
        </Group>
        <Group>
          <PrayerExtraRow which="pre" label="اقتربت الصلاة" Icon={AlarmClock} before />
          <PrayerExtraRow which="iqama" label="اقتربت الإقامة" Icon={Mosque} before={false} />
        </Group>
        {!coords ? (
          <p className="text-[11px] text-warning leading-relaxed px-1">
            حدّد موقعك من تبويب «الصلاة» ليُجدوَل الأذان — بدون موقع لا تُحسب المواقيت.
          </p>
        ) : null}
      </Section>

      <Section title="الأذكار والدعاء">
        <Group>
          <ReminderRow cfgKey="dhikr.morning" label="أذكار الصباح" Icon={Sun} hint={(c) => (adhkarSmart ? 'ذكي — في وقتك المعتاد، ويصمت إن قرأتها' : `يومياً ${fmtTime(c.time)}`)} />
          <ReminderRow cfgKey="dhikr.evening" label="أذكار المساء" Icon={Moon} hint={(c) => (adhkarSmart ? 'ذكي — بعد العصر في وقتك، ويصمت إن قرأتها' : `يومياً ${fmtTime(c.time)}`)} />
          <ReminderRow cfgKey="duaa" label="الدعاء" Icon={HandHeart} hint={(c) => `يومياً ${fmtTime(c.time)}`} />
        </Group>
      </Section>

      <Section title="قيام الليل" subtitle="تذكير واحد في الليلة">
        <Group>
          <ReminderRow
            cfgKey="qiyam"
            label="قيام الليل"
            Icon={MoonStar}
            tone="gold"
            showTime={!qiyamSmart || !coords}
            hint={(c) =>
              qiyamSmart && coords
                ? lastThird
                  ? `عند دخول الثلث الأخير · الليلة ${toArabicDigits(formatPrayerTime(lastThird))}`
                  : 'عند دخول الثلث الأخير من الليل'
                : `يومياً ${fmtTime(c.time)}`
            }
          >
            {qiyamCfg.enabled ? (
              <div className="mt-3 ps-12 flex flex-col gap-2">
                <Segmented
                  label="وقت تذكير القيام"
                  value={qiyamSmart ? 'smart' : 'fixed'}
                  onChange={(v) => setSmart({ qiyam: v === 'smart' })}
                  options={[
                    { id: 'smart', label: 'الثلث الأخير' },
                    { id: 'fixed', label: 'وقت ثابت' },
                  ]}
                />
                {qiyamSmart && !coords ? (
                  <p className="text-[11px] text-text-muted leading-relaxed">
                    يحتاج الثلث الأخير موقعك؛ حتى تحدّده يصلك التذكير في الوقت الثابت.
                  </p>
                ) : null}
              </div>
            ) : null}
          </ReminderRow>
        </Group>
      </Section>

      <Section title="صلاة الضحى" subtitle="نافلة النهار، بين الشروق والظهر">
        <Group>
          <ReminderRow cfgKey="duha" label="صلاة الضحى" Icon={SunMedium} tone="gold" hint={(c) => `يومياً ${fmtTime(c.time)}`} />
        </Group>
      </Section>

      <Section title="القرآن والأوراد">
        <Group>
          <ReminderRow cfgKey="quran" label="الورد القرآني" Icon={BookOpen} hint={(c) => (wirdSmart ? 'ذكي — بما بقي من وردك، ويصمت إن أتممته' : `يومياً ${fmtTime(c.time)}`)} />
          <LinkRow
            Icon={Target}
            title="تنبيهات الأوراد"
            hint={awradOn ? `${toArabicDigits(awradOn)} وِرد بتنبيه مفعّل · تُضبط من كل وِرد` : 'تُضبط من صفحة كل وِرد'}
            to="/targets"
          />
        </Group>
      </Section>

      <Section title="العلم والمهام" subtitle="تذكير الدروس والمهام يُضبط من كل حلقة ومهمة">
        <Group>
          <LinkRow
            Icon={GraduationCap}
            title="الحلقات والمهام"
            hint={
              !supported
                ? 'افتح الحلقة أو المهمة لضبط تذكيرها'
                : studyArmed.length
                  ? `مجدول: ${toArabicDigits(studyArmed.length - tasksArmed)} للدروس · ${toArabicDigits(tasksArmed)} للمهام`
                  : 'لا تذكير مجدول بعد — أضف وقتاً لحلقة أو مهمة'
            }
            to="/study"
          />
        </Group>
      </Section>

      <Section title="آية وحديث" subtitle="تدبّر قصير يصلك على مدار اليوم">
        <InspirationSettings />
      </Section>

      <Section title="العادات">
        <Group>
          <ReminderRow cfgKey="habits" label="تذكير العادات" Icon={Star} fullScreen={false} hint={(c) => `يومياً ${fmtTime(c.time)}`} />
          <LinkRow
            Icon={Star}
            title="تنبيه لكل عادة"
            hint={habitsOn ? `${toArabicDigits(habitsOn)} عادة بتنبيه خاص` : 'حدّد وقتاً لكل عادة من صفحة العادات'}
            to="/habits"
          />
        </Group>
      </Section>

      <Section title="الصيام والمناسبات">
        <Group>
          <ReminderRow
            cfgKey="fasting"
            label="تذكير الصيام"
            Icon={Moon}
            tone="gold"
            fullScreen={false}
            hint={() => 'ليالي الإثنين والخميس والأيام البيض وعرفة وعاشوراء'}
          >
            {fastingCfg.enabled ? (
              <p className="mt-2 ps-12 text-[11px] text-text-muted leading-relaxed text-pretty">
                يصلك مساء الليلة السابقة ٩ م، وفي رمضان تنبيه السحور {fmtTime(fastingCfg.time)} (اضبطه من التفاصيل).
              </p>
            ) : null}
          </ReminderRow>
          <ReminderRow
            cfgKey="special"
            label="المناسبات الإسلامية"
            Icon={CalendarDays}
            tone="gold"
            showTime={false}
            fullScreen={false}
            hint={() => 'صباح كل مناسبة ٩ ص'}
          />
        </Group>
      </Section>

      <Section title="رفيقك اليومي" subtitle="إشعارات تتعلّم أوقاتك من عبادتك، وتكتب لك بأرقامك، وتصمت حين تُنجز">
        <Group>
          <SmartRow
            k="prayerCheck"
            title="هل صلّيت؟"
            body="بعد الأذان بالوقت الذي تسجّل فيه عادةً، إن لم تسجّل الصلاة بعد — وفيه زر «صلّيت». لمن يسجّل صلواته فقط"
            Icon={Mosque as unknown as LucideIcon}
          />
          <SmartRow
            k="adhkarNudges"
            title="الأذكار في أوقاتك"
            body="الصباح والمساء والنوم وبعد كل صلاة، في الوقت الذي اعتدته، ويحلّ محل التذكير الثابت"
            Icon={Wand2}
          />
          <SmartRow k="wirdNudges" title="وِرد القرآن والأوراد" body="ما بقي من كل ختمة وأورادك اليومية في وقتك، وختمة توقّفت عنها بكلامها ووقتها، ودعوة أسبوعية لنوع لم تجرّبه" Icon={BookOpenText} />
          <SmartRow k="challenges" title="تحدّي اليوم" body="إن بقيت خطوة واحدة على يوم كامل في أوسمتك" Icon={Trophy} />
          <SmartRow
            k="lateCalls"
            title="آخر الوقت"
            body="قبل خروج وقت الفجر والظهر والعصر والمغرب بدقائق، إن لم تُسجَّل الصلاة بعد. لمن يسجّل صلواته فقط"
            Icon={Hourglass}
          />
          <SmartRow
            k="suggestions"
            title="سنن تغيب عنك"
            body="مرة في اليوم على الأكثر: سنة قلّما تفعلها (الضحى، المسجد، أذكار النوم، الصدقة) في وقتها، وسورة الكهف وساعة الإجابة يوم الجمعة"
            Icon={Sparkles}
          />
          <SmartRow
            k="brief"
            title="موجز الصباح"
            body="بعد الفجر أو حين تبدأ يومك عادةً: صيام اليوم ومناسبته ودروسك ومهامك ووردك، في إشعار واحد"
            Icon={Coffee}
          />
          <SmartRow
            k="wrapup"
            title="ختام اليوم"
            body="قبل موعد نومك المعتاد: ما بقي ممكناً من يومك (الوتر والأذكار ووردك) والسلسلة التي على المحكّ"
            Icon={BedDouble}
          />
          <MutedSuggestions />
          <CompanionEase />
          <SmartUpcoming />
        </Group>
      </Section>

      <Section title="الإشعارات الذكية" subtitle="تُبنى من إحصاءاتك، وتصمت حين تُنجز">
        <Group>
          <SmartRow k="streak" title="حماية السلسلة" body="تنبيه مسائي واحد إن لم تُتمّ سلسلة اليوم، ويُلغى فور تسجيلها" Icon={Flame} />
          <SmartRow k="weekly" title="حصاد الأسبوع" body="كل جمعة بعد العصر: أسبوعك بأرقامه الحقيقية، وصفحة حصاده كاملة" Icon={CalendarCheck} />
          <SmartRow
            k="race"
            title="لحظات الترتيب"
            body="مرة في اليوم على الأكثر: إن اقتربت من تجاوز أمسك، أو كان تاج اليوم أو الأسبوع أو الشهر على المحكّ، وصباح كل سبت"
            Icon={Crown}
          />
          <SmartRow k="celebrate" title="الاحتفاء بالإنجاز" body="تهنئة واحدة عند رقم قياسي جديد، لا تتكرر" Icon={Sparkles} />
          <div className="px-3 py-3">
            <div className="flex items-center gap-3">
              <Chip Icon={BellOff} on={smart.quietEnabled} tone="gold" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-text-primary dark:text-text-on-dark">ساعات الهدوء</p>
                <p className="text-[11px] text-text-muted leading-relaxed text-pretty">
                  لا إشعارات ذكية فيها. الأذان وتذكيراتك المضبوطة وتذكير القيام و«هل صلّيت؟» تصل دائماً.
                </p>
              </div>
              <Toggle checked={smart.quietEnabled} onChange={(v) => setSmart({ quietEnabled: v })} size="sm" label="ساعات الهدوء" hideLabel />
            </div>
            {smart.quietEnabled ? (
              <div className="grid grid-cols-2 gap-2 mt-2.5 ps-12">
                {(['quietStart', 'quietEnd'] as const).map((k) => (
                  <label
                    key={k}
                    className="flex items-center justify-between gap-2 rounded-[var(--radius-inner)] bg-cream-dark/55 dark:bg-dark-surface px-3 min-h-11"
                  >
                    <span className="text-xs text-text-muted">{k === 'quietStart' ? 'من' : 'إلى'}</span>
                    <input
                      type="time"
                      value={smart[k]}
                      onChange={(e) => e.target.value && setSmart({ [k]: e.target.value })}
                      className="bg-transparent font-counter tabular-nums text-sm text-text-primary dark:text-text-on-dark outline-none"
                      aria-label={`ساعات الهدوء ${k === 'quietStart' ? 'من' : 'إلى'}`}
                      dir="ltr"
                    />
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        </Group>
      </Section>

      {customs.length ? (
        <Section title="تذكيراتك الخاصة" subtitle="أضفتها من الأقسام — اضغط للحذف">
          <Group>
            {customs.map((r) => {
              const at = new Date(r.triggerTime);
              return (
                <div key={r.id} className="flex items-center gap-3 px-3 py-3">
                  <Chip Icon={BellRing} on />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-text-primary dark:text-text-on-dark truncate">{r.title}</p>
                    <p className="text-[11px] text-text-muted truncate">
                      {SECTION_LABEL[r.section] ?? 'عام'} · {r.repeat === 'daily' ? 'يومياً' : 'مرة'} {toArabicDigits(formatPrayerTime(at))}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      removeCustom(r.id);
                      toast.success('حُذف التذكير');
                    }}
                    aria-label={`حذف ${r.title}`}
                    className="w-10 h-10 rounded-xl inline-flex items-center justify-center text-text-muted hover:text-danger hover:bg-danger/5"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </Group>
        </Section>
      ) : null}

      <Section title="أدوات" subtitle="ضبط سريع لتذكيرات الأذكار والعبادات">
        <div className="grid grid-cols-3 gap-2">
          {([
            { id: 'morning' as const, label: 'صباحي', hint: '٦ ص', Icon: Sunrise, danger: false },
            { id: 'evening' as const, label: 'مسائي', hint: '٦ م', Icon: Sunset, danger: false },
            { id: 'off' as const, label: 'إيقاف الكل', hint: 'مع الصلوات', Icon: BellOff, danger: true },
          ]).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.id)}
              className={[
                'min-h-[4.5rem] rounded-[var(--radius-inner)] bg-white dark:bg-dark-card ring-1 ring-black/[0.04] dark:ring-white/[0.06] py-3 flex flex-col items-center gap-1 transition-colors',
                p.danger ? 'hover:bg-danger/5' : 'hover:bg-teal/5',
              ].join(' ')}
            >
              <p.Icon size={18} className={p.danger ? 'text-danger' : 'text-teal dark:text-teal-light'} />
              <span className="text-xs font-bold text-text-primary dark:text-text-on-dark">{p.label}</span>
              <span className="text-[10.5px] text-text-muted">{p.hint}</span>
            </button>
          ))}
        </div>
        {health.platform === 'android' ? (
          <Button
            variant="soft"
            fullWidth
            leftIcon={<Smartphone size={16} />}
            onClick={() =>
              void fullScreenAlarm.test().then((ok) =>
                ok ? toast.success('يظهر المنبّه خلال ٤ ثوانٍ', 'أقفل الشاشة الآن لتجربته على القفل') : toast.error('تعذّر تشغيل التجربة'),
              )
            }
          >
            جرّب شاشة المنبّه الكاملة
          </Button>
        ) : null}
      </Section>
    </>
  );
}
