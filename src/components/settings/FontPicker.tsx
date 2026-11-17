import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { useSettingsStore } from '@/store/settingsStore';
import { APP_FONTS, APP_FONT_GROUPS, appFontById, fontStack, type AppFontGroup } from '@/data/appFonts';
import { hapticsService } from '@/services/HapticsService';

const SAMPLE = 'بسم الله نبدأ يومنا · ١٢٣٤';

/**
 * «خط التطبيق» — grouped list of Arabic UI fonts, each previewed in its own
 * face. Previews load the fonts lazily (local bundled chunks) when the
 * picker mounts; choosing one swaps the app's font tokens immediately.
 */
export function FontPicker() {
  const appFont = useSettingsStore((s) => s.appFont);
  const setAppFont = useSettingsStore((s) => s.setAppFont);
  const current = appFontById(appFont);
  const [group, setGroup] = useState<AppFontGroup>(current.group);
  const [ready, setReady] = useState<Record<string, boolean>>({});

  const list = useMemo(() => APP_FONTS.filter((f) => f.group === group), [group]);

  // Load the visible group's fonts for their previews.
  useEffect(() => {
    let cancelled = false;
    for (const f of list) {
      if (ready[f.id]) continue;
      f.load()
        .then(() => {
          if (!cancelled) setReady((r) => ({ ...r, [f.id]: true }));
        })
        .catch(() => undefined);
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);

  return (
    <div className="flex flex-col gap-3">
      <div
        role="tablist"
        aria-label="فئات الخطوط"
        className="flex gap-1 rounded-2xl bg-cream-dark/60 dark:bg-dark-surface p-1"
      >
        {APP_FONT_GROUPS.map((g) => (
          <button
            key={g.id}
            type="button"
            role="tab"
            aria-selected={group === g.id}
            onClick={() => setGroup(g.id)}
            className={[
              'flex-1 rounded-xl py-2 text-xs font-semibold transition-colors',
              group === g.id
                ? 'bg-white dark:bg-dark-card shadow-[var(--shadow-xs)] text-teal dark:text-teal-light'
                : 'text-text-muted hover:text-text-secondary',
            ].join(' ')}
          >
            {g.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2" role="radiogroup" aria-label="خط التطبيق">
        {list.map((f) => {
          const on = f.id === current.id;
          return (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                void hapticsService.selection();
                setAppFont(f.id);
              }}
              className={[
                'w-full text-start rounded-[var(--radius-inner)] px-4 py-3 ring-1 transition-shadow flex items-center gap-3',
                on
                  ? 'bg-teal/8 ring-2 ring-teal'
                  : 'bg-white dark:bg-dark-card ring-black/[0.05] dark:ring-white/[0.07] hover:ring-teal/25',
              ].join(' ')}
            >
              <span className="flex-1 min-w-0" style={{ fontFamily: fontStack(f), opacity: ready[f.id] ? 1 : 0.35 }}>
                <span className="flex items-baseline gap-2">
                  <span className="text-base font-bold text-text-primary dark:text-text-on-dark">{f.label}</span>
                  <span className="text-[11px] text-text-muted truncate">{f.hint}</span>
                </span>
                <span className="block mt-1 text-[15px] text-text-secondary dark:text-text-on-dark/80 truncate">
                  {SAMPLE}
                </span>
              </span>
              <span
                className={[
                  'w-6 h-6 rounded-full inline-flex items-center justify-center shrink-0',
                  on ? 'bg-teal text-on-accent' : 'ring-1 ring-black/10 dark:ring-white/15',
                ].join(' ')}
                aria-hidden
              >
                {on ? <Check size={14} strokeWidth={3} /> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
