import { useEffect, useRef, useState } from 'react';
import { Music, Play, Pause, Check } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import {
  SELECTABLE_SOUNDS,
  getSoundDef,
  previewUrl,
  type SoundKey,
} from '@/services/notifications/sounds';
import { isCustomSoundSupported } from '@/services/customSound';

/**
 * Compact button that shows the currently-selected ringtone (preset OR a
 * user-picked custom file) and opens a bottom-sheet picker with preview.
 */
export function SoundSelector({
  value,
  onChange,
  onPickCustom,
  customLabel,
  ariaLabel,
}: {
  value: SoundKey | undefined;
  onChange: (key: SoundKey) => void;
  /** Open the native file picker for a custom sound (Android only). */
  onPickCustom?: () => void;
  /** Non-empty when a custom file is the active sound. */
  customLabel?: string | null;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const def = getSoundDef(value);
  const isCustom = !!customLabel;
  const label = isCustom ? (customLabel as string) : def.labelAr;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={ariaLabel ? `${ariaLabel}: ${label}` : `النغمة: ${label}`}
        title={label}
        className="inline-flex items-center gap-1.5 ps-2 pe-2.5 h-9 rounded-xl shrink-0 bg-cream-dark/60 dark:bg-dark-surface text-text-secondary dark:text-text-on-dark/80 hover:bg-teal/10 max-w-[9.5rem] transition-colors"
      >
        <span aria-hidden className="text-sm leading-none">{isCustom ? '🎵' : def.emoji}</span>
        <span className="text-[11px] font-semibold truncate">{label}</span>
        <Music size={12} className="text-text-muted shrink-0" aria-hidden />
      </button>

      <SoundPickerSheet
        open={open}
        onClose={() => setOpen(false)}
        value={value}
        isCustom={isCustom}
        customLabel={customLabel}
        onPickCustom={
          onPickCustom
            ? () => {
                setOpen(false);
                onPickCustom();
              }
            : undefined
        }
        onSelect={(k) => {
          onChange(k);
          setOpen(false);
        }}
      />
    </>
  );
}

function SoundPickerSheet({
  open,
  onClose,
  value,
  isCustom,
  customLabel,
  onPickCustom,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  value: SoundKey | undefined;
  isCustom: boolean;
  customLabel?: string | null;
  onPickCustom?: () => void;
  onSelect: (key: SoundKey) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<SoundKey | null>(null);

  useEffect(() => {
    if (!open) stop();
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function stop() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlaying(null);
  }

  function preview(key: SoundKey) {
    if (playing === key) {
      stop();
      return;
    }
    stop();
    const url = previewUrl(key);
    if (!url) return;
    const audio = new Audio(url);
    audioRef.current = audio;
    setPlaying(key);
    audio.onended = () => setPlaying((p) => (p === key ? null : p));
    audio.play().catch(() => setPlaying((p) => (p === key ? null : p)));
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="اختر النغمة">
      <ul className="flex flex-col gap-1.5">
        {/* Custom file picker (Android) — always at the top. */}
        {onPickCustom && isCustomSoundSupported() ? (
          <li>
            <button
              type="button"
              onClick={onPickCustom}
              className={[
                'flex items-center gap-2.5 w-full rounded-[var(--radius-inner)] px-3 py-2.5 text-start transition-colors',
                isCustom ? 'bg-gold/15 ring-1 ring-gold/40' : 'bg-cream-dark/60 dark:bg-dark-surface hover:bg-gold/10',
              ].join(' ')}
            >
              <span className="w-9 h-9 inline-flex items-center justify-center rounded-full bg-gold/20 text-base shrink-0">📁</span>
              <span className="flex-1 min-w-0 text-sm text-text-primary dark:text-text-on-dark">
                {isCustom ? (
                  <>
                    ملف مختار:{' '}
                    <span className="font-semibold">{customLabel}</span>
                    <span className="block text-[11px] text-text-muted">اضغط لاختيار ملف آخر</span>
                  </>
                ) : (
                  'اختر ملفاً صوتياً من الجهاز…'
                )}
              </span>
              {isCustom ? <Check size={18} className="text-teal dark:text-teal-light shrink-0" /> : null}
            </button>
          </li>
        ) : null}

        {SELECTABLE_SOUNDS.map((key) => {
          const def = getSoundDef(key);
          const selected = !isCustom && (value ?? 'default') === key;
          const hasPreview = !!previewUrl(key);
          const isPlaying = playing === key;
          return (
            <li key={key}>
              <div
                className={[
                  'flex items-center gap-2.5 rounded-[var(--radius-inner)] px-3 py-2.5 transition-colors',
                  selected ? 'bg-teal/10 ring-1 ring-teal/40' : 'bg-cream-dark/60 dark:bg-dark-surface',
                ].join(' ')}
              >
                <button
                  type="button"
                  disabled={!hasPreview}
                  onClick={() => preview(key)}
                  aria-label={isPlaying ? 'إيقاف المعاينة' : 'استماع'}
                  className={[
                    'w-9 h-9 inline-flex items-center justify-center rounded-full shrink-0',
                    hasPreview
                      ? 'bg-gold/15 text-gold-dark dark:text-gold-light hover:bg-gold/25'
                      : 'text-text-muted/40',
                  ].join(' ')}
                >
                  {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                </button>

                <button
                  type="button"
                  onClick={() => onSelect(key)}
                  className="flex-1 min-w-0 text-start"
                >
                  <span className="text-sm text-text-primary dark:text-text-on-dark">
                    <span aria-hidden className="me-1.5">{def.emoji}</span>
                    {def.labelAr}
                  </span>
                </button>

                {selected ? <Check size={18} className="text-teal dark:text-teal-light shrink-0" /> : null}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-text-muted leading-relaxed mt-4">
        أصوات الأذان والتكبير حقيقية. يمكنك أيضاً اختيار أي ملف صوتي من جهازك لأي تنبيه.
      </p>
    </BottomSheet>
  );
}
