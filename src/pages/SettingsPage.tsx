import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import {
  Award, ChevronLeft, Download, Hand, HandHeart, Moon, Sun, Coins, Smartphone, User,
  Volume2, Check, Navigation, LogIn, LogOut, RefreshCw, Cloud, Sparkles, BookOpen, MoonStar, Star,
  Clock, Type, Zap, Contrast, LayoutGrid, MapPin, Users, Trophy, EyeOff,
  History,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Mosque } from '@/components/icons/Mosque';
import { Card } from '@/components/ui/Card';
import { Toggle } from '@/components/ui/Toggle';
import { Button } from '@/components/ui/Button';
import { Medallion, SectionTitle, ArchMotif, Star8 } from '@/components/ui/Ornament';
import { TextInput } from '@/components/ui/TextInput';
import { PalettePicker } from '@/components/settings/PalettePicker';
import { FontPicker } from '@/components/settings/FontPicker';
import { GenderPicker } from '@/components/settings/GenderPicker';
import { NotificationCenter } from '@/components/reminders/NotificationCenter';
import { useSettingsStore } from '@/store/settingsStore';
import { useAuthStore } from '@/store/authStore';
import { isSupabaseConfigured } from '@/services/supabaseClient';
import { useI18n } from '@/hooks/useI18n';
import { useGeolocation } from '@/hooks/useGeolocation';
import { reverseGeocode } from '@/services/geocodeService';
import { volumeKeysSupported } from '@/services/volumeKeys';
import { hapticsService } from '@/services/HapticsService';
import { toast } from '@/store/toastStore';
import { toArabicDigits } from '@/utils/arabicFormat';
import { BUNDLE_VERSION, checkForUpdate, promptUpdate, updatesSupported } from '@/services/appUpdate';
import type { ModuleId, PrayerMethodId } from '@/types';

const PRAYER_METHODS: { id: PrayerMethodId; labelKey: string }[] = [
  { id: 1, labelKey: 'method_mwl' },
  { id: 2, labelKey: 'method_isna' },
  { id: 3, labelKey: 'method_egypt' },
  { id: 4, labelKey: 'method_makkah' },
  { id: 5, labelKey: 'method_karachi' },
];

const MADHABS = [
  { id: 'shafi' as const, labelKey: 'settings_madhab_shafi' },
  { id: 'hanafi' as const, labelKey: 'settings_madhab_hanafi' },
];

const ALL_MODULES: { id: ModuleId; labelKey: string; Icon: LucideIcon }[] = [
  { id: 'prayers', labelKey: 'module_prayers', Icon: Mosque },
  { id: 'dhikr', labelKey: 'module_dhikr', Icon: Sparkles },
  { id: 'quran', labelKey: 'module_quran', Icon: BookOpen },
  { id: 'qiyam', labelKey: 'module_qiyam', Icon: MoonStar },
  { id: 'fasting', labelKey: 'module_fasting', Icon: Moon },
  { id: 'duaa', labelKey: 'module_duaa', Icon: HandHeart },
  { id: 'habits', labelKey: 'module_habits', Icon: Star },
];

type SettingsTab = 'account' | 'appearance' | 'notifications' | 'prayer' | 'worship';
const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: 'account', label: 'الحساب' },
  { id: 'appearance', label: 'المظهر' },
  { id: 'notifications', label: 'التنبيهات' },
  { id: 'prayer', label: 'الصلاة' },
  { id: 'worship', label: 'العبادات' },
];
const isTab = (v: string | null): v is SettingsTab => SETTINGS_TABS.some((t) => t.id === v);

const FONT_SCALES: { id: 'small' | 'normal' | 'large'; label: string; sample: string }[] = [
  { id: 'small', label: 'صغير', sample: 'text-[13px]' },
  { id: 'normal', label: 'عادي', sample: 'text-[16px]' },
  { id: 'large', label: 'كبير', sample: 'text-[20px]' },
];

/* ───────────────────────── Shared building blocks ───────────────────────── */

/** Icon chip used at the start of every settings row. */
function Chip({ Icon, tone = 'teal' }: { Icon: LucideIcon; tone?: 'teal' | 'gold' | 'muted' }) {
  const cls =
    tone === 'gold'
      ? 'bg-gold/15 text-gold-dark dark:text-gold-light'
      : tone === 'muted'
        ? 'bg-cream-dark/70 dark:bg-dark-surface text-text-muted'
        : 'bg-teal/10 text-teal dark:bg-teal/15 dark:text-teal-light';
  return (
    <span className={`w-9 h-9 rounded-xl inline-flex items-center justify-center shrink-0 ${cls}`}>
      <Icon size={17} />
    </span>
  );
}

/** One row inside a grouped card: chip · title/hint · trailing control. */
function Row({
  Icon,
  tone,
  title,
  hint,
  trailing,
  children,
}: {
  Icon: LucideIcon;
  tone?: 'teal' | 'gold' | 'muted';
  title: ReactNode;
  hint?: ReactNode;
  trailing?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="px-3 py-3">
      <div className="flex items-center gap-3">
        <Chip Icon={Icon} tone={tone} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-text-primary dark:text-text-on-dark">{title}</p>
          {hint ? <p className="text-[11px] text-text-muted leading-relaxed text-pretty">{hint}</p> : null}
        </div>
        {trailing ? <div className="shrink-0 flex items-center gap-1.5">{trailing}</div> : null}
      </div>
      {children}
    </div>
  );
}

/** Navigation row (whole row is the button). */
function LinkRow({ Icon, title, hint, to }: { Icon: LucideIcon; title: string; hint?: string; to: string }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(to)}
      className="w-full flex items-center gap-3 px-3 py-3 rounded-[var(--radius-inner)] text-start hover:bg-teal/5 transition-colors"
    >
      <Chip Icon={Icon} />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-text-primary dark:text-text-on-dark">{title}</span>
        {hint ? <span className="block text-[11px] text-text-muted truncate">{hint}</span> : null}
      </span>
      <ChevronLeft size={16} className="text-text-muted shrink-0" />
    </button>
  );
}

/** A grouped list card with hairline separators between rows. */
function Group({ children }: { children: ReactNode }) {
  return (
    <Card className="p-1.5 divide-y divide-black/[0.05] dark:divide-white/[0.06]">{children}</Card>
  );
}

/** Segmented control (design-system chip group). */
function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { id: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-2xl bg-cream-dark/60 dark:bg-dark-surface p-1">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={String(o.id)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => {
              if (on) return;
              void hapticsService.selection();
              onChange(o.id);
            }}
            className={[
              'flex-1 min-h-10 px-2 rounded-xl text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 transition-colors duration-200',
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

function Block({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle title={title} subtitle={subtitle} action={action} />
      {children}
    </section>
  );
}

/* ─────────────────────────────── The page ──────────────────────────────── */

export function SettingsPage() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const qTab = params.get('tab');
  const tab: SettingsTab = isTab(qTab) ? qTab : 'account';
  const setTab = (id: SettingsTab) => setParams(id === 'account' ? {} : { tab: id }, { replace: true });

  return (
    <div className="flex flex-col gap-6 px-4 pb-nav" style={{ paddingTop: 'calc(var(--safe-top) + 1rem)' }}>
      <header>
        <p className="text-xs text-text-muted">خصّص رفيقك</p>
        <h1 className="text-[26px] font-display font-bold text-text-primary dark:text-text-on-dark text-balance">
          {t('settings_title')}
        </h1>
        <p className="text-[13px] text-text-secondary dark:text-text-on-dark/70 mt-0.5">
          الحساب والمظهر والتنبيهات ومواقيت الصلاة
        </p>
      </header>

      <ProfileHero />

      {/* Sticky segmented tabs */}
      <div
        className="sticky z-20 -mx-4 px-4 py-2 -my-2 bg-cream/85 dark:bg-dark-bg/85 backdrop-blur-xl"
        style={{ top: 'var(--safe-top)' }}
      >
        <div
          role="tablist"
          aria-label="أقسام الإعدادات"
          className="flex gap-1 rounded-2xl bg-cream-dark/60 dark:bg-dark-surface p-1 overflow-x-auto no-scrollbar"
        >
          {SETTINGS_TABS.map((tb) => {
            const on = tab === tb.id;
            return (
              <button
                key={tb.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setTab(tb.id)}
                className={[
                  'flex-1 shrink-0 min-h-10 px-2.5 rounded-xl text-[12.5px] font-bold whitespace-nowrap transition-colors duration-200',
                  on
                    ? 'bg-white dark:bg-dark-card shadow-[var(--shadow-xs)] text-teal dark:text-teal-light'
                    : 'text-text-secondary dark:text-text-on-dark/70 hover:text-teal',
                ].join(' ')}
              >
                {tb.label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === 'account' ? <AccountTab /> : null}
      {tab === 'appearance' ? <AppearanceTab /> : null}
      {tab === 'notifications' ? <NotificationsTab /> : null}
      {tab === 'prayer' ? <PrayerTab /> : null}
      {tab === 'worship' ? <WorshipTab /> : null}
    </div>
  );
}

/** Identity hero: initial seal, name, where the data lives. */
function ProfileHero() {
  const userName = useSettingsStore((s) => s.userName);
  const city = useSettingsStore((s) => s.city);
  const user = useAuthStore((s) => s.user);
  const initial = (userName || 'ر').trim().charAt(0);
  const syncLine = !isSupabaseConfigured
    ? 'بياناتك محفوظة على هذا الجهاز'
    : user
      ? 'متزامن سحابياً بين أجهزتك'
      : 'محفوظ على هذا الجهاز · سجّل الدخول للمزامنة';

  return (
    <Card variant="hero" className="p-4">
      <ArchMotif className="absolute -top-6 -start-6 w-32 opacity-15" />
      <div className="flex items-center gap-3.5">
        <Medallion size={60} tone="onAccent">
          <span className="text-xl font-display">{initial}</span>
        </Medallion>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-on-accent/70">السلام عليكم</p>
          <p className="text-xl font-display font-bold truncate">{userName || 'أهلاً بك'}</p>
          <p className="text-[11px] text-on-accent/80 truncate inline-flex items-center gap-1">
            <Cloud size={12} className="shrink-0" /> {syncLine}
            {city ? <span className="opacity-80"> · {city}</span> : null}
          </p>
        </div>
      </div>
    </Card>
  );
}

/* ──────────────────────────────── الحساب ──────────────────────────────── */

function AccountTab() {
  const { t } = useI18n();
  const userName = useSettingsStore((s) => s.userName);
  const setUserName = useSettingsStore((s) => s.setUserName);
  const gender = useSettingsStore((s) => s.gender);
  const setGender = useSettingsStore((s) => s.setGender);
  const hapticsEnabled = useSettingsStore((s) => s.hapticsEnabled);
  const setHapticsEnabled = useSettingsStore((s) => s.setHapticsEnabled);

  // Name is edited locally and committed with an explicit Save — a store write
  // per keystroke re-rendered the whole page and dropped Arabic IME input.
  const [nameInput, setNameInput] = useState(userName);
  useEffect(() => setNameInput(userName), [userName]);
  const nameDirty = nameInput.trim() !== userName;
  const saveName = () => {
    setUserName(nameInput.trim());
    toast.success('تم حفظ الاسم');
  };

  return (
    <>
      <Block title={t('settings_profile')} subtitle="كيف يناديك رفيقي">
        <Group>
          <Row Icon={User} title={t('your_name')}>
            <div className="flex items-center gap-2 mt-2.5">
              <TextInput
                value={nameInput}
                onValueChange={setNameInput}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && nameDirty) saveName();
                }}
                placeholder="اسمك"
                aria-label={t('your_name')}
                className="flex-1 min-w-0 min-h-11 rounded-xl bg-cream-dark/55 dark:bg-dark-surface px-3.5 text-sm text-text-primary dark:text-text-on-dark placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-teal/40"
              />
              {nameDirty ? (
                <Button size="sm" className="min-h-11" leftIcon={<Check size={14} />} onClick={saveName}>
                  حفظ
                </Button>
              ) : null}
            </div>
          </Row>
          <Row Icon={Users} title="أنا" hint="صلاة المسجد والجمعة للرجال، وأيام العذر وصيغ الأذكار للنساء">
            <div className="mt-2.5">
              <GenderPicker value={gender} onChange={setGender} />
            </div>
          </Row>
          <Row
            Icon={Smartphone}
            title={t('settings_haptics')}
            hint={t('settings_haptics_subtitle')}
            trailing={
              <Toggle checked={hapticsEnabled} onChange={setHapticsEnabled} size="sm" label={t('settings_haptics')} hideLabel />
            }
          />
        </Group>
      </Block>

      {isSupabaseConfigured ? <AccountSection /> : null}
      {isSupabaseConfigured ? <LeaderboardPrefs /> : null}

      <Block title="بياناتك وأدواتك">
        <Card className="p-1.5">
          <LinkRow Icon={Download} title="التنزيلات والعمل دون إنترنت" hint="نزّل الأذكار الصوتية للاستماع دون اتصال" to="/downloads" />
          <LinkRow Icon={Download} title={t('settings_backup')} hint="صدّر بياناتك في ملف واستعدها متى شئت" to="/backup" />
          <LinkRow Icon={Award} title="الأوسمة" hint="إنجازاتك في رحلة العبادة" to="/badges" />
          <LinkRow Icon={HandHeart} title="سجل الصدقات" to="/sadaqah" />
          <LinkRow Icon={Coins} title="حاسبة الزكاة" to="/zakat" />
          <LinkRow Icon={LayoutGrid} title="كل الميزات" hint="القبلة، الأدعية، التقويم…" to="/more" />
          <LinkRow Icon={History} title="سجل التحديثات" hint={`نسختك ${toArabicDigits(BUNDLE_VERSION)}، وما الجديد في كل تحديث`} to="/changelog" />
        </Card>
      </Block>

      <Card variant="gradient-edge" className="p-5 text-center flex flex-col items-center gap-1.5">
        <Star8 size={22} className="text-gold" />
        <p className="font-ornate text-2xl text-teal dark:text-teal-light mt-1">رَفِيقِي</p>
        <p className="text-[11px] text-text-muted">رفيقك في العبادة</p>
        <div className="w-16 h-px bg-gold/40 my-2" aria-hidden />
        <p className="text-[11px] text-text-muted">تطوير وتصميم</p>
        <p className="font-display text-base font-bold text-text-primary dark:text-text-on-dark">م / حسن علي</p>
        <p className="text-[11px] text-text-muted mt-2" dir="ltr">v{BUNDLE_VERSION}</p>
        {updatesSupported ? <CheckUpdateButton /> : null}
      </Card>
    </>
  );
}

/** «الترتيب»: take part (off = rows deleted from the board) and hide the name. */
function LeaderboardPrefs() {
  const join = useSettingsStore((s) => s.leaderboardJoin);
  const setJoin = useSettingsStore((s) => s.setLeaderboardJoin);
  const hide = useSettingsStore((s) => s.leaderboardHideName);
  const setHide = useSettingsStore((s) => s.setLeaderboardHideName);
  return (
    <Block title="الترتيب" subtitle="يُرفع مجموع نقاطك فقط، لا تفاصيل عبادتك">
      <Group>
        <Row
          Icon={Trophy}
          tone="gold"
          title="المشاركة في الترتيب"
          hint="إيقافها يحذف نقاطك من ترتيب اليوم والأسبوع"
          trailing={<Toggle checked={join} onChange={setJoin} size="sm" label="المشاركة في الترتيب" hideLabel />}
        />
        <Row
          Icon={EyeOff}
          title="إخفاء اسمي في الترتيب"
          hint="يراك الآخرون باسم «مجهول» ورقم ثابت"
          trailing={<Toggle checked={hide} onChange={setHide} size="sm" label="إخفاء اسمي في الترتيب" hideLabel disabled={!join} />}
        />
        <LinkRow Icon={Trophy} title="عرض الترتيب" to="/leaderboard" />
      </Group>
    </Block>
  );
}

/** Manual update check; a found update shows the same prompt as the start-up check. */
function CheckUpdateButton() {
  const [busy, setBusy] = useState(false);
  const check = async () => {
    setBusy(true);
    try {
      const m = await checkForUpdate();
      if (m) promptUpdate(m);
      else toast.success('أنت على أحدث إصدار');
    } catch {
      toast.error('تعذّر التحقق من التحديثات', 'تأكد من اتصالك بالإنترنت');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant="soft" size="sm" leftIcon={<RefreshCw size={14} />} onClick={check} loading={busy}>
      التحقق من التحديثات
    </Button>
  );
}

/**
 * Account + cloud-sync card. Signed-out → Google sign-in. Signed-in → email,
 * "sync now" and sign-out. Only rendered when Supabase is configured.
 */
function AccountSection() {
  const { user, busy, syncing, signInWithGoogle, signOut, syncNow } = useAuthStore();

  return (
    <Block title="الحساب والمزامنة" subtitle="احفظ تقدّمك سحابياً بين أجهزتك">
      {user ? (
        <Card className="p-4 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Chip Icon={Cloud} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text-primary dark:text-text-on-dark truncate">
                {(user.user_metadata?.full_name as string) || 'مسجّل الدخول'}
              </p>
              <p className="text-[11px] text-text-muted truncate" dir="ltr">
                {user.email}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-success/12 text-success px-2 py-0.5 text-[10.5px] font-bold">
              <Check size={11} strokeWidth={3} /> متزامن
            </span>
          </div>
          <p className="text-[11px] text-text-muted leading-relaxed text-pretty">
            التقدّم والإشارات والإعدادات تُحفظ سحابياً وتُزامَن تلقائياً بين أجهزتك ما دمت متصلاً.
          </p>
          <div className="flex gap-2">
            <Button
              variant="soft"
              size="sm"
              fullWidth
              leftIcon={<RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />}
              onClick={syncNow}
              disabled={syncing}
            >
              {syncing ? 'جارٍ المزامنة…' : 'مزامنة الآن'}
            </Button>
            <Button variant="ghost" size="sm" leftIcon={<LogOut size={14} />} onClick={signOut}>
              خروج
            </Button>
          </div>
        </Card>
      ) : (
        <Card variant="gradient-edge" className="p-4 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Chip Icon={Cloud} tone="gold" />
            <p className="flex-1 text-sm text-text-primary dark:text-text-on-dark leading-relaxed text-pretty">
              سجّل الدخول بحساب Google لحفظ بياناتك ومزامنتها بين أجهزتك.
            </p>
          </div>
          <Button variant="primary" fullWidth leftIcon={<LogIn size={16} />} onClick={signInWithGoogle} loading={busy}>
            تسجيل الدخول بـ Google
          </Button>
        </Card>
      )}
    </Block>
  );
}

/* ──────────────────────────────── المظهر ──────────────────────────────── */

function AppearanceTab() {
  const darkMode = useSettingsStore((s) => s.darkMode);
  const setDarkMode = useSettingsStore((s) => s.setDarkMode);
  const fontScale = useSettingsStore((s) => s.fontScale);
  const setFontScale = useSettingsStore((s) => s.setFontScale);
  const timeFormat = useSettingsStore((s) => s.timeFormat);
  const setTimeFormat = useSettingsStore((s) => s.setTimeFormat);
  const reduceMotion = useSettingsStore((s) => s.reduceMotion);
  const setReduceMotion = useSettingsStore((s) => s.setReduceMotion);
  const highContrast = useSettingsStore((s) => s.highContrast);
  const setHighContrast = useSettingsStore((s) => s.setHighContrast);

  return (
    <>
      <Block title="لوحة الألوان" subtitle="الطابع الذي يلبسه التطبيق كله">
        <PalettePicker />
      </Block>

      <Block title="الوضع">
        <Segmented
          label="الوضع الفاتح أو الداكن"
          value={darkMode ? 'dark' : 'light'}
          onChange={(v) => setDarkMode(v === 'dark')}
          options={[
            { id: 'light', label: <><Sun size={15} /> فاتح</> },
            { id: 'dark', label: <><Moon size={15} /> داكن</> },
          ]}
        />
      </Block>

      <Block title="خط التطبيق" subtitle="اختر الخط العربي الذي يريحك — لا يغيّر خط المصحف">
        <FontPicker />
      </Block>

      <Block title="النص والوقت">
        <Group>
          <Row Icon={Type} title="حجم الخط" hint="يكبّر نصوص التطبيق كله">
            <div className="mt-2.5">
              <Segmented
                label="حجم الخط"
                value={fontScale}
                onChange={setFontScale}
                options={FONT_SCALES.map((fs) => ({
                  id: fs.id,
                  label: (
                    <span className="inline-flex items-baseline gap-1.5">
                      <span className={`font-display font-bold leading-none ${fs.sample}`}>أ</span>
                      <span className="text-xs">{fs.label}</span>
                    </span>
                  ),
                }))}
              />
            </div>
          </Row>
          <Row Icon={Clock} title="صيغة الوقت" hint="لمواقيت الصلاة والتذكيرات">
            <div className="mt-2.5">
              <Segmented
                label="صيغة الوقت"
                value={timeFormat}
                onChange={setTimeFormat}
                options={[
                  { id: '12h', label: '١٢ ساعة (ص/م)' },
                  { id: '24h', label: '٢٤ ساعة' },
                ]}
              />
            </div>
          </Row>
        </Group>
      </Block>

      <Block title="إمكانية الوصول">
        <Group>
          <Row
            Icon={Zap}
            title="تقليل الحركة"
            hint="يوقف الرسوم المتحركة"
            trailing={<Toggle checked={reduceMotion} onChange={setReduceMotion} size="sm" label="تقليل الحركة" hideLabel />}
          />
          <Row
            Icon={Contrast}
            title="تباين عالٍ"
            hint="نصوص وحدود أوضح"
            trailing={<Toggle checked={highContrast} onChange={setHighContrast} size="sm" label="تباين عالٍ" hideLabel />}
          />
        </Group>
      </Block>
    </>
  );
}

/* ─────────────────────────────── التنبيهات ─────────────────────────────── */

/** «التنبيهات» — the full notification center (status, القادم, every
 *  reminder family, smart + inspiration settings) lives in reminders/. */
function NotificationsTab() {
  return <NotificationCenter />;
}


function PrayerTab() {
  const { t } = useI18n();
  const coords = useSettingsStore((s) => s.coords);
  const city = useSettingsStore((s) => s.city);
  const country = useSettingsStore((s) => s.country);
  const setCoords = useSettingsStore((s) => s.setCoords);
  const setCity = useSettingsStore((s) => s.setCity);
  const setCountry = useSettingsStore((s) => s.setCountry);
  const prayerMethod = useSettingsStore((s) => s.prayerMethod);
  const setPrayerMethod = useSettingsStore((s) => s.setPrayerMethod);
  const madhabSchool = useSettingsStore((s) => s.madhabSchool);
  const setMadhabSchool = useSettingsStore((s) => s.setMadhabSchool);
  const { status, request } = useGeolocation();

  const handleUpdateLocation = async () => {
    const fresh = await request();
    if (fresh) {
      setCoords(fresh);
      // Resolve a readable city/country so the user can verify it's correct.
      void reverseGeocode(fresh).then((place) => {
        if (place?.city) setCity(place.city);
        if (place?.country) setCountry(place.country);
      });
      toast.success(t('location_updated'));
    }
  };

  return (
    <>
      <Block title={t('settings_location')} subtitle="تُحسب مواقيت الصلاة والقبلة منه">
        <Card className="p-4 flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <Chip Icon={coords ? Navigation : MapPin} tone={coords ? 'teal' : 'gold'} />
            <div className="flex-1 min-w-0">
              {coords ? (
                <>
                  <p className="text-sm font-semibold text-text-primary dark:text-text-on-dark">
                    {city || country ? [city, country].filter(Boolean).join('، ') : 'تم تحديد الموقع'}
                  </p>
                  <p className="text-[11px] text-text-muted font-counter tabular-nums mt-0.5" dir="ltr">
                    {coords.latitude.toFixed(4)}, {coords.longitude.toFixed(4)}
                  </p>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${coords.latitude},${coords.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] font-semibold text-teal dark:text-teal-light underline underline-offset-2 mt-1 inline-block"
                  >
                    عرض على الخريطة للتأكّد
                  </a>
                </>
              ) : (
                <p className="text-sm text-text-muted leading-relaxed">لم يُحدَّد موقعك بعد. اضغط الزر بالأسفل.</p>
              )}
            </div>
          </div>
          <Button variant="secondary" fullWidth onClick={handleUpdateLocation} loading={status === 'loading'} leftIcon={<Navigation size={15} />}>
            {status === 'success' ? t('location_updated') : t('update_location')}
          </Button>
        </Card>
      </Block>

      <Block title={t('prayer_method')} subtitle="اختر ما يعتمده أهل بلدك">
        <Card className="p-1.5" as="section">
          <div role="radiogroup" aria-label={t('prayer_method')}>
            {PRAYER_METHODS.map((m) => {
              const on = prayerMethod === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setPrayerMethod(m.id)}
                  className={[
                    'w-full flex items-center gap-3 px-3 py-3 rounded-[var(--radius-inner)] text-start transition-colors',
                    on ? 'bg-teal/8 dark:bg-teal/12' : 'hover:bg-teal/5',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'w-5 h-5 rounded-full inline-flex items-center justify-center shrink-0 transition-colors',
                      on ? 'bg-[image:var(--gradient-teal)] text-on-accent' : 'ring-2 ring-inset ring-text-muted/35',
                    ].join(' ')}
                  >
                    {on ? <Check size={12} strokeWidth={3} /> : null}
                  </span>
                  <span
                    className={[
                      'flex-1 text-sm',
                      on ? 'font-bold text-teal dark:text-teal-light' : 'font-medium text-text-primary dark:text-text-on-dark',
                    ].join(' ')}
                  >
                    {t(m.labelKey)}
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      </Block>

      <Block title={t('madhab')} subtitle="يؤثّر في وقت العصر">
        <Segmented
          label={t('madhab')}
          value={madhabSchool}
          onChange={setMadhabSchool}
          options={MADHABS.map((m) => ({ id: m.id, label: <span className="text-xs leading-tight">{t(m.labelKey)}</span> }))}
        />
      </Block>
    </>
  );
}

/* ─────────────────────────────── العبادات ─────────────────────────────── */

function WorshipTab() {
  const { t } = useI18n();
  const enabledModules = useSettingsStore((s) => s.enabledModules);
  const toggleModule = useSettingsStore((s) => s.toggleModule);
  const quranDailyTarget = useSettingsStore((s) => s.quranDailyTarget);
  const setQuranDailyTarget = useSettingsStore((s) => s.setQuranDailyTarget);
  const volumeKeyCounter = useSettingsStore((s) => s.volumeKeyCounter);
  const setVolumeKeyCounter = useSettingsStore((s) => s.setVolumeKeyCounter);

  const stepBtn =
    'w-10 h-10 rounded-xl bg-cream-dark/60 dark:bg-dark-surface text-teal dark:text-teal-light font-bold text-lg inline-flex items-center justify-center hover:bg-teal/10 disabled:opacity-40';

  return (
    <>
      <Block title={t('settings_quran')}>
        <Group>
          <Row
            Icon={BookOpen}
            title={t('daily_pages_target')}
            hint="من ١ إلى ٢٠ صفحة"
            trailing={
              <>
                <button
                  type="button"
                  onClick={() => setQuranDailyTarget(Math.max(1, quranDailyTarget - 1))}
                  disabled={quranDailyTarget <= 1}
                  className={stepBtn}
                  aria-label="إنقاص"
                >
                  −
                </button>
                <span className="w-9 text-center text-xl font-bold text-teal dark:text-teal-light font-counter tabular-nums">
                  {toArabicDigits(quranDailyTarget)}
                </span>
                <button
                  type="button"
                  onClick={() => setQuranDailyTarget(Math.min(20, quranDailyTarget + 1))}
                  disabled={quranDailyTarget >= 20}
                  className={stepBtn}
                  aria-label="زيادة"
                >
                  +
                </button>
              </>
            }
          />
        </Group>
      </Block>

      <Block title="العدّ والتسبيح">
        <Group>
          <Row
            Icon={Hand}
            title="اضغط على النص للعدّ"
            hint="مفعّل دائماً: الضغط على نص الذكر أو الوِرد يزيد العدّاد."
            trailing={<Check size={18} className="text-teal dark:text-teal-light" aria-label="مفعّل" />}
          />
          {volumeKeysSupported() ? (
            <Row
              Icon={Volume2}
              title="العدّ بأزرار الصوت"
              hint="داخل الأذكار والأوراد والسبحة يزيد زرّا الصوت العدّاد ولا يغيّران مستواه. خارجها يعملان كالمعتاد."
              trailing={
                <Toggle checked={volumeKeyCounter} onChange={setVolumeKeyCounter} size="sm" label="العدّ بأزرار الصوت" hideLabel />
              }
            />
          ) : null}
        </Group>
      </Block>

      <Block title={t('settings_modules')} subtitle="أخفِ ما لا تستخدمه من الرئيسة">
        <Group>
          {ALL_MODULES.map((mod) => {
            const on = enabledModules.includes(mod.id);
            return (
              <Row
                key={mod.id}
                Icon={mod.Icon}
                tone={on ? 'teal' : 'muted'}
                title={t(mod.labelKey)}
                hint={mod.id === 'prayers' ? 'أساسية ولا يمكن إخفاؤها' : undefined}
                trailing={
                  <Toggle
                    checked={on}
                    onChange={() => toggleModule(mod.id)}
                    size="sm"
                    disabled={mod.id === 'prayers'}
                    label={t(mod.labelKey)}
                    hideLabel
                  />
                }
              />
            );
          })}
        </Group>
      </Block>
    </>
  );
}
