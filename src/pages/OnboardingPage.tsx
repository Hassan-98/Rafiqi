import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from '@/lib/motion';
import { Moon, MapPin, BellRing, ClipboardCheck, User, Check, Compass } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/TextInput';
import { Card } from '@/components/ui/Card';
import { Medallion, OrnamentRule, ArchMotif, Star8 } from '@/components/ui/Ornament';
import { PalettePicker } from '@/components/settings/PalettePicker';
import { GenderPicker } from '@/components/settings/GenderPicker';
import { useSettingsStore } from '@/store/settingsStore';
import { useGeolocation } from '@/hooks/useGeolocation';
import { forwardGeocode } from '@/services/geocodeService';
import { useI18n } from '@/hooks/useI18n';
import type { Coordinates } from '@/types';
import { ReliabilitySetup } from '@/components/settings/ReliabilitySetup';
import { toast } from '@/store/toastStore';
import { toArabicDigits } from '@/utils/arabicFormat';
import type { PrayerMethodId } from '@/types';

const METHODS: { id: PrayerMethodId; labelKey: string }[] = [
  { id: 4, labelKey: 'method_makkah' },
  { id: 1, labelKey: 'method_mwl' },
  { id: 2, labelKey: 'method_isna' },
  { id: 3, labelKey: 'method_egypt' },
  { id: 5, labelKey: 'method_karachi' },
];

const STEPS = ['welcome', 'location', 'method', 'review', 'permissions'] as const;
type Step = (typeof STEPS)[number];

const variants = {
  enter: (dir: number) => ({ x: dir > 0 ? '100%' : '-100%', opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir < 0 ? '100%' : '-100%', opacity: 0 }),
};

export function OnboardingPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { setUserName, setCoords, setCity, setPrayerMethod, completeOnboarding, setGender } = useSettingsStore();
  const gender = useSettingsStore((s) => s.gender);
  const { coords, status, error: geoError, request } = useGeolocation();

  const [step, setStep] = useState<Step>('welcome');
  const [direction, setDirection] = useState(1);
  const [name, setName] = useState('');
  const [city, setCityInput] = useState('');
  const [method, setMethod] = useState<PrayerMethodId>(4);
  // Coordinates resolved from a TYPED city (prayer times need coordinates —
  // a bare city string used to yield no times and no adhan, silently).
  const [cityCoords, setCityCoords] = useState<Coordinates | null>(null);
  const [cityResolve, setCityResolve] = useState<'idle' | 'loading' | 'ok' | 'fail'>('idle');

  const stepIndex = STEPS.indexOf(step);

  const next = () => {
    setDirection(1);
    setStep(STEPS[stepIndex + 1] ?? 'permissions');
  };

  /** Leaving the location step: resolve the typed city to coordinates first. */
  const nextFromLocation = async () => {
    if (!coords && city.trim() && !cityCoords) {
      setCityResolve('loading');
      const resolved = await forwardGeocode(city.trim());
      if (resolved) {
        setCityCoords(resolved.coords);
        setCityResolve('ok');
      } else {
        // Don't trap the user (they may be offline) — proceed, but the review
        // step will show the location as unresolved instead of pretending.
        setCityResolve('fail');
      }
    }
    next();
  };
  const prev = () => {
    setDirection(-1);
    setStep(STEPS[stepIndex - 1] ?? 'welcome');
  };

  const finish = (afterPermissions: boolean) => {
    // Store ONLY what the user actually typed. Previously this saved the
    // literal 'أخي' when left blank, which then looked permanently stuck in
    // Settings. Empty is fine — the Home greeting falls back to 'يا أخي' for
    // display only.
    setUserName(name.trim());
    if (coords) setCoords(coords);
    else if (cityCoords) setCoords(cityCoords);
    if (city.trim()) setCity(city.trim());
    setPrayerMethod(method);
    completeOnboarding();
    if (afterPermissions) toast.success(t('toast_saved'));
    navigate('/', { replace: true });
  };

  const handleRequestLocation = async () => {
    const fresh = await request();
    if (fresh) setCoords(fresh);
  };

  const methodLabel = t(METHODS.find((m) => m.id === method)?.labelKey ?? 'method_makkah');
  const locationSummary = coords
    ? t('location_detected')
    : cityCoords && city.trim()
      ? `${city.trim()} ✓`
      : city.trim()
        ? `${city.trim()} — تعذّر تحديد إحداثياتها`
        : 'لم يُحدّد بعد';

  const field =
    'w-full min-h-12 rounded-[var(--radius-inner)] bg-white dark:bg-dark-card px-4 text-base text-text-primary dark:text-text-on-dark placeholder:text-text-muted ring-1 ring-black/[0.06] dark:ring-white/[0.08] focus:outline-none focus:ring-2 focus:ring-teal/50';

  return (
    <div
      className="relative min-h-dvh bg-cream dark:bg-dark-bg bg-geometric flex flex-col overflow-hidden"
      style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}
    >
      {/* Faint mihrab behind everything */}
      <ArchMotif className="absolute -top-10 left-1/2 -translate-x-1/2 w-[26rem] max-w-none text-gold opacity-[0.07]" />

      {/* Step progress: one segment per step */}
      <div className="relative w-full max-w-sm mx-auto px-6 pt-8">
        <div className="flex items-center gap-1.5" aria-hidden>
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={[
                'h-1.5 flex-1 rounded-full transition-colors duration-300',
                i < stepIndex ? 'bg-teal dark:bg-teal-light' : i === stepIndex ? 'bg-gold' : 'bg-black/[0.08] dark:bg-white/[0.1]',
              ].join(' ')}
            />
          ))}
        </div>
        <p className="text-center text-[11px] text-text-muted mt-2">
          الخطوة {toArabicDigits(stepIndex + 1)} من {toArabicDigits(STEPS.length)}
        </p>
      </div>

      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="absolute inset-0 overflow-y-auto px-6 py-4 flex flex-col items-center"
          >
            <div className="my-auto w-full max-w-sm">
              {step === 'welcome' && (
                <div className="flex flex-col items-center gap-6">
                  <div className="flex flex-col items-center text-center">
                    <Medallion size={104} tone="gold" className="animate-breathe motion-reduce:animate-none">
                      <Star8 size={34} className="text-gold" />
                    </Medallion>
                    <p className="text-xs text-text-muted mt-5">بسم الله نبدأ</p>
                    <h1 className="font-ornate text-5xl text-teal dark:text-teal-light mt-1 leading-[1.5]">
                      {t('appName')}
                    </h1>
                    <p className="text-[15px] text-text-secondary dark:text-text-on-dark/75 text-balance">
                      {t('appSubtitle')}
                    </p>
                  </div>
                  <OrnamentRule className="w-40" />
                  <Card variant="gradient-edge" className="w-full p-5 flex flex-col gap-4">
                    <label className="flex flex-col gap-2">
                      <span className="text-sm font-bold text-text-primary dark:text-text-on-dark">{t('your_name')}</span>
                      <TextInput value={name} onValueChange={setName} placeholder="أدخل اسمك" className={field} />
                    </label>
                    <div className="flex flex-col gap-2">
                      <span className="text-sm font-bold text-text-primary dark:text-text-on-dark">أنا</span>
                      <GenderPicker value={gender} onChange={setGender} />
                      <span className="text-[11px] text-text-muted">لصلاة المسجد والجمعة، أو أيام العذر وصيغ الأذكار</span>
                    </div>
                    <div className="flex flex-col gap-2">
                      <span className="text-sm font-bold text-text-primary dark:text-text-on-dark">اختر طابعك</span>
                      <PalettePicker compact />
                      <span className="text-[11px] text-text-muted">يمكنك تغييره لاحقاً من الإعدادات</span>
                    </div>
                  </Card>
                </div>
              )}

              {step === 'location' && (
                <StepCard icon={<MapPin size={26} strokeWidth={1.7} />} title={t('your_location')} desc={t('location_desc')}>
                  <Button variant="primary" fullWidth onClick={handleRequestLocation} loading={status === 'loading'}>
                    {status === 'success' ? (
                      <span className="inline-flex items-center gap-2">
                        <Check size={18} strokeWidth={2.2} />
                        {t('location_detected')}
                      </span>
                    ) : (
                      t('detect_location')
                    )}
                  </Button>
                  {(status === 'denied' || status === 'error') && geoError ? (
                    <p role="alert" className="text-xs text-danger leading-relaxed text-center">
                      {geoError}
                      {status === 'denied' ? ' يمكنك إدخال مدينتك يدوياً بالأسفل.' : ''}
                    </p>
                  ) : null}
                  <div className="flex items-center gap-3 text-text-muted">
                    <span className="h-px flex-1 bg-gold/25" />
                    <span className="text-xs">{t('or')}</span>
                    <span className="h-px flex-1 bg-gold/25" />
                  </div>
                  <TextInput
                    placeholder={t('enter_city')}
                    aria-label={t('enter_city')}
                    value={city}
                    onValueChange={(v) => {
                      setCityInput(v);
                      // Edited city invalidates any previously resolved coordinates.
                      setCityCoords(null);
                      setCityResolve('idle');
                    }}
                    className={field}
                  />
                  {cityResolve === 'fail' ? (
                    <p className="text-xs text-danger leading-relaxed text-center">
                      لم نعثر على هذه المدينة. جرّب اسماً أشهر أو استخدم تحديد الموقع.
                    </p>
                  ) : null}
                </StepCard>
              )}

              {step === 'method' && (
                <StepCard icon={<Moon size={26} strokeWidth={1.7} />} title={t('prayer_method')} desc={t('prayer_method_desc')}>
                  <div
                    role="radiogroup"
                    aria-label={t('prayer_method')}
                    className="rounded-[var(--radius-inner)] bg-white/70 dark:bg-dark-card/70 ring-1 ring-black/[0.05] dark:ring-white/[0.07] p-1"
                  >
                    {METHODS.map((m) => {
                      const active = method === m.id;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => setMethod(m.id)}
                          className={[
                            'w-full px-3 py-3 rounded-xl text-start text-sm transition-colors flex items-center gap-3',
                            active
                              ? 'bg-teal/10 dark:bg-teal/15 font-bold text-teal dark:text-teal-light'
                              : 'font-medium text-text-primary dark:text-text-on-dark hover:bg-teal/5',
                          ].join(' ')}
                        >
                          <span
                            className={[
                              'w-5 h-5 rounded-full inline-flex items-center justify-center shrink-0',
                              active ? 'bg-[image:var(--gradient-teal)] text-on-accent' : 'ring-2 ring-inset ring-text-muted/35',
                            ].join(' ')}
                          >
                            {active ? <Check size={12} strokeWidth={3} /> : null}
                          </span>
                          <span className="flex-1">{t(m.labelKey)}</span>
                        </button>
                      );
                    })}
                  </div>
                </StepCard>
              )}

              {step === 'review' && (
                <StepCard icon={<ClipboardCheck size={26} strokeWidth={1.7} />} title="مراجعة بياناتك" desc="تأكّد من المعلومات قبل البدء">
                  <div className="rounded-[var(--radius-inner)] bg-white/70 dark:bg-dark-card/70 ring-1 ring-black/[0.05] dark:ring-white/[0.07] divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                    <ReviewRow icon={<User size={17} strokeWidth={1.8} />} label={t('your_name')} value={name.trim() || '—'} />
                    <ReviewRow icon={<Compass size={17} strokeWidth={1.8} />} label={t('your_location')} value={locationSummary} />
                    <ReviewRow icon={<Moon size={17} strokeWidth={1.8} />} label={t('prayer_method')} value={methodLabel} />
                  </div>
                </StepCard>
              )}

              {step === 'permissions' && (
                <StepCard
                  icon={<BellRing size={26} strokeWidth={1.7} />}
                  title={t('onboarding_permissions_title')}
                  desc="لكي تصلك التنبيهات في وقتها بدقّة، فعّل الأذونات التالية. هذه خطوة لمرّة واحدة."
                >
                  <ReliabilitySetup />
                  <div className="flex flex-col gap-2 pt-1">
                    <Button variant="primary" fullWidth onClick={() => finish(true)}>
                      تم، لنبدأ
                    </Button>
                    <Button variant="ghost" fullWidth onClick={() => finish(false)}>
                      {t('onboarding_permissions_later')}
                    </Button>
                  </div>
                </StepCard>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Cap to the step-card width so the buttons don't span a 1920px window. */}
      {step !== 'permissions' ? (
        <div className="relative flex gap-3 px-6 pt-2 pb-8 w-full max-w-sm mx-auto">
          {stepIndex > 0 ? (
            <Button variant="secondary" onClick={prev}>
              {t('back')}
            </Button>
          ) : null}
          <Button
            variant="primary"
            fullWidth
            loading={cityResolve === 'loading'}
            onClick={() => (step === 'location' ? void nextFromLocation() : next())}
          >
            {step === 'review' ? t('confirm') : stepIndex === 0 ? 'ابدأ' : t('next')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** Shared step layout: seal icon · title · description · content. */
function StepCard({ icon, title, desc, children }: { icon: ReactNode; title: string; desc: string; children: ReactNode }) {
  return (
    <Card variant="gradient-edge" className="w-full p-6 flex flex-col gap-5">
      <div className="flex flex-col items-center text-center gap-3">
        <Medallion size={72} tone="gold">
          <span className="text-gold-dark dark:text-gold-light">{icon}</span>
        </Medallion>
        <h2 className="text-2xl font-bold font-display text-text-primary dark:text-text-on-dark text-balance">{title}</h2>
        <p className="text-sm text-text-secondary dark:text-text-on-dark/70 leading-relaxed text-pretty -mt-1">{desc}</p>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </Card>
  );
}

function ReviewRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-3">
      <span className="w-9 h-9 rounded-xl bg-teal/10 dark:bg-teal/15 text-teal dark:text-teal-light inline-flex items-center justify-center shrink-0">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] text-text-muted">{label}</p>
        <p className="text-sm font-semibold text-text-primary dark:text-text-on-dark truncate">{value}</p>
      </div>
    </div>
  );
}
