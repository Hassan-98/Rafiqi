import { useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  Gauge,
  Hourglass,
  LoaderCircle,
  Mic,
  MoonStar,
  Pause,
  Play,
  Repeat,
  RotateCcw,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Square,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Toggle } from '@/components/ui/Toggle';
import {
  BackgroundPlayToggle,
  ControlSection,
  Segmented,
  SleepChip,
  SleepPicker,
  SpeedChips,
  Stepper,
  VolumeControl,
  rateLabel,
  type SleepValue,
} from '@/components/audio/ListenControls';
import { useKeepAwake } from '@/hooks/useKeepAwake';
import { useAdhkarListenStore } from '@/store/adhkarListenStore';
import { VolumePopover } from '@/components/audio/VolumePopover';
import { toArabicDigits } from '@/utils/arabicFormat';
import { LISTEN_RATES, type PauseMode, type RepeatMode } from './listenLogic';
import type { ListenState } from './useAdhkarListen';

/** Keeps the screen on while mounted (rendered only while listening). */
export function StayAwake() {
  useKeepAwake();
  return null;
}

const ICON_BTN =
  'w-11 h-11 rounded-xl inline-flex items-center justify-center shrink-0 transition-colors text-text-secondary dark:text-text-on-dark/80 hover:text-teal hover:bg-teal/5 disabled:opacity-30';

/**
 * The listening strip above the counter. Top row: what the reciter is doing
 * now, the repetition n/N, an active sleep timer, settings and stop. Bottom
 * row: speed · previous · play/pause · next · recite again.
 */
export function ListenPanel({
  state,
  rep,
  of,
  review,
  onPause,
  onResume,
  onStop,
}: {
  state: ListenState;
  /** The repetition being recited (1-based). */
  rep: number;
  of: number;
  /** The card is already complete — recited once for review, not counted. */
  review: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
}) {
  const rate = useAdhkarListenStore((s) => s.rate);
  const repeatMode = useAdhkarListenStore((s) => s.repeatMode);
  const fixedTimes = useAdhkarListenStore((s) => s.fixedTimes ?? 3);
  const setPrefs = useAdhkarListenStore((s) => s.setPrefs);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sleepMin, setSleepMin] = useState(0);
  const { phase, controls } = state;

  const title =
    phase === 'loading'
      ? 'يجري تحميل التلاوة'
      : phase === 'reciting'
        ? 'يتلو القارئ الآن'
        : phase === 'turn'
          ? 'دورك الآن، ردّد الذكر'
          : phase === 'waiting'
            ? 'لا تتوفر تلاوة لهذا الذكر'
            : 'الاستماع متوقف مؤقتاً';
  // `here` counts completed recitations (it ticks after the user's turn).
  const hereNow = Math.min(fixedTimes, (state.here ?? 0) + 1);
  const sub =
    phase === 'waiting'
      ? 'اقرأه بنفسك، أو انتقل إلى التالي'
      : repeatMode === 'fixed'
        ? `التكرار ${toArabicDigits(Math.max(1, hereNow))} من ${toArabicDigits(fixedTimes)}`
        : review
          ? 'للمراجعة، دون احتساب'
          : repeatMode === 'once'
            ? 'مرة واحدة ثم الذكر التالي'
            : `التكرار ${toArabicDigits(rep)} من ${toArabicDigits(of)}`;

  const Icon = phase === 'loading' ? LoaderCircle : phase === 'turn' ? Mic : phase === 'waiting' ? VolumeX : AudioLines;
  const paused = phase === 'paused';

  const sleepValue: SleepValue = state.sleepAfterItem ? 'end' : state.sleepAt ? sleepMin || -1 : 0;
  const setSleep = (v: SleepValue) => {
    if (typeof v === 'number') setSleepMin(v);
    controls?.setSleep(v);
  };

  return (
    <div className="w-full lg:max-w-2xl lg:mx-auto relative overflow-hidden rounded-[var(--radius-inner)] bg-white dark:bg-dark-card ring-1 ring-gold/25 dark:ring-gold/20 shadow-[var(--shadow-xs)] px-1.5 pt-1.5 pb-1 flex flex-col">
      <div className="flex items-center gap-1.5 ps-0.5">
        <span
          aria-hidden
          className={[
            'relative w-9 h-9 rounded-xl inline-flex items-center justify-center shrink-0',
            phase === 'turn' ? 'bg-gold/15 text-gold-dark dark:text-gold-light' : 'bg-teal/10 text-teal dark:text-teal-light',
          ].join(' ')}
        >
          {phase === 'reciting' ? (
            <span className="absolute inset-0 rounded-xl ring-2 ring-teal/40 animate-pulse motion-reduce:animate-none" />
          ) : null}
          <Icon size={18} className={phase === 'loading' ? 'animate-spin motion-reduce:animate-none' : ''} />
        </span>
        <span className="flex-1 min-w-0" aria-live="polite">
          <span className="block text-[13px] font-bold text-text-primary dark:text-text-on-dark truncate">{title}</span>
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="text-[11px] text-text-muted font-counter truncate">{sub}</span>
            <SleepChip endsAt={state.sleepAt ?? null} endLabel={state.sleepAfterItem ? 'بعد هذا الذكر' : undefined} />
          </span>
        </span>
        <button type="button" onClick={() => setSettingsOpen(true)} aria-label="إعدادات الاستماع" className={ICON_BTN}>
          <SlidersHorizontal size={17} />
        </button>
        <AdhkarVolumeButton />
        <button type="button" onClick={onStop} aria-label="إنهاء الاستماع" className="w-11 h-11 rounded-xl inline-flex items-center justify-center shrink-0 transition-colors text-text-muted hover:text-danger hover:bg-danger/10">
          <Square size={15} />
        </button>
      </div>

      {/* Transport. RTL: previous on the right, next on the left. */}
      <div className="flex items-center justify-between gap-1 mt-1 pt-1 border-t border-black/[0.04] dark:border-white/[0.05]">
        <button
          type="button"
          onClick={() => setPrefs({ rate: LISTEN_RATES[(LISTEN_RATES.indexOf(rate as never) + 1) % LISTEN_RATES.length] })}
          aria-label={`سرعة التلاوة ${rateLabel(rate)}`}
          className="h-11 min-w-11 px-1.5 rounded-xl text-[12px] font-bold font-counter tabular-nums text-text-secondary dark:text-text-on-dark/80 hover:text-teal hover:bg-teal/5 transition-colors shrink-0"
        >
          {rateLabel(rate)}
        </button>
        <span className="flex items-center gap-1.5">
          <button type="button" onClick={controls?.prev} aria-label="الذكر السابق" className={ICON_BTN}>
            <SkipForward size={18} />
          </button>
          <button
            type="button"
            onClick={paused ? onResume : onPause}
            aria-label={paused ? 'متابعة الاستماع' : 'إيقاف مؤقت'}
            className="w-12 h-11 rounded-2xl inline-flex items-center justify-center shrink-0 bg-[image:var(--gradient-teal)] text-on-accent active:scale-95 transition-transform"
          >
            {paused ? <Play size={19} /> : <Pause size={19} />}
          </button>
          <button type="button" onClick={controls?.next} aria-label="الذكر التالي" className={ICON_BTN}>
            <SkipBack size={18} />
          </button>
        </span>
        <button type="button" onClick={controls?.replay} aria-label="أعد تلاوة الذكر" className={ICON_BTN}>
          <RotateCcw size={17} />
        </button>
      </div>

      {phase === 'turn' && state.turnMs > 0 ? <TurnSweep key={`${rep}-${state.here ?? 0}-${state.turnMs}`} ms={state.turnMs} /> : null}

      <ListenSettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        sleep={controls ? { value: sleepValue, endsAt: state.sleepAt ?? null, afterItem: !!state.sleepAfterItem, onChange: setSleep } : undefined}
      />
    </div>
  );
}

/** A hairline that fills over the user's turn — how long until the next recitation. */
function TurnSweep({ ms }: { ms: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const a = ref.current?.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], {
      duration: ms,
      easing: 'linear',
      fill: 'forwards',
    });
    return () => a?.cancel();
  }, [ms]);
  return <span ref={ref} aria-hidden className="absolute bottom-0 inset-x-0 h-0.5 bg-gold origin-right" style={{ transform: 'scaleX(0)' }} />;
}

export function ListenSettingsSheet({
  open,
  onClose,
  sleep,
}: {
  open: boolean;
  onClose: () => void;
  /** Sleep timer (only while listening). */
  sleep?: { value: SleepValue; endsAt: number | null; afterItem: boolean; onChange: (v: SleepValue) => void };
}) {
  const p = useAdhkarListenStore();
  return (
    <BottomSheet open={open} onClose={onClose} title="إعدادات الاستماع">
      <div className="flex flex-col gap-3 pb-2">
        <ControlSection icon={<Volume2 size={16} />} title="مستوى صوت التلاوة" hint="نسبةً إلى صوت الوسائط في جهازك، وأزرار الصوت تعمل كالمعتاد">
          <VolumeControl volume={p.volume} muted={p.muted} onChange={(volume, muted) => p.setPrefs({ volume, muted })} />
        </ControlSection>

        <ControlSection icon={<Gauge size={16} />} title="سرعة التلاوة">
          <SpeedChips value={p.rate} onChange={(rate) => p.setPrefs({ rate })} />
        </ControlSection>

        <ControlSection icon={<Repeat size={16} />} title="التكرار">
          <Segmented<RepeatMode>
            label="التكرار"
            value={p.repeatMode}
            options={[
              { v: 'count', l: 'حسب العدد' },
              { v: 'once', l: 'مرة واحدة' },
              { v: 'fixed', l: 'عدد ثابت' },
            ]}
            onChange={(repeatMode) => p.setPrefs({ repeatMode })}
          />
          {p.repeatMode === 'fixed' ? (
            <Stepper label="مرات كل ذكر" value={p.fixedTimes ?? 3} min={2} max={10} onChange={(fixedTimes) => p.setPrefs({ fixedTimes })} />
          ) : null}
        </ControlSection>

        <ControlSection icon={<Hourglass size={16} />} title="مهلة الترديد بعد كل تلاوة">
          <Segmented<PauseMode>
            label="مهلة الترديد بعد كل تلاوة"
            value={p.pause}
            options={[
              { v: 0, l: 'بلا' },
              { v: 2, l: `${toArabicDigits(2)} ث` },
              { v: 5, l: `${toArabicDigits(5)} ث` },
              { v: 'match', l: 'بطول التلاوة' },
            ]}
            onChange={(pause) => p.setPrefs({ pause })}
          />
        </ControlSection>

        {sleep ? (
          <ControlSection
            icon={<MoonStar size={16} />}
            title="مؤقت الإيقاف"
            hint="يتوقف الاستماع وحده بعد المدة"
            aside={<SleepChip endsAt={sleep.endsAt} endLabel={sleep.afterItem ? 'بعد هذا الذكر' : undefined} />}
          >
            <SleepPicker value={sleep.value} minutes={[10, 15, 30, 60]} endLabel="بعد هذا الذكر" onChange={sleep.onChange} />
          </ControlSection>
        ) : null}

        <div className="flex items-center justify-between gap-3 rounded-[var(--radius-inner)] bg-white dark:bg-dark-card ring-1 ring-black/[0.04] dark:ring-white/[0.06] p-3.5">
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold text-text-primary dark:text-text-on-dark">تخطَّ الأذكار التي بلا تلاوة</span>
            <span className="block text-[11.5px] text-text-muted text-pretty">عند إيقافه ينتظرك الاستماع حتى تقرأها بنفسك</span>
          </span>
          <Toggle checked={p.skipNoAudio} onChange={(skipNoAudio) => p.setPrefs({ skipNoAudio })} label="تخطَّ الأذكار التي بلا تلاوة" hideLabel />
        </div>
        <BackgroundPlayToggle />
        <p className="text-[11px] text-text-muted text-pretty">
          كل تلاوة تُحتسب مرة في العدّاد بعد مهلة الترديد. التلاوات من «حصن المسلم»، والسور بصوت الشيخ محمود خليل الحصري.
        </p>
      </div>
    </BottomSheet>
  );
}

/** Volume right in the listening panel (reactive to the persisted prefs). */
function AdhkarVolumeButton() {
  const volume = useAdhkarListenStore((s) => s.volume);
  const muted = useAdhkarListenStore((s) => s.muted);
  const setPrefs = useAdhkarListenStore((s) => s.setPrefs);
  return <VolumePopover volume={volume} muted={muted} onChange={(v, m) => setPrefs({ volume: v, muted: m })} />;
}
