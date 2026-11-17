import React from 'react';
import { useI18n } from '@/hooks/useI18n';
import { toArabicDigits } from '@/utils/arabicFormat';
import type { ModuleId } from '@/types';

interface ModuleData {
  moduleId: ModuleId;
  label: string;
  value: number; // 0–100
}

interface DailyRingProps {
  modules: ModuleData[];
  overallValue: number;
}

/** Palette tokens only, so every palette × mode colours the rings. */
const MODULE_COLORS: Record<ModuleId, string> = {
  prayers: 'var(--color-teal)',
  dhikr: 'var(--color-gold)',
  quran: 'var(--color-teal-light)',
  qiyam: 'var(--color-gold-dark)',
  fasting: 'var(--color-teal-dark)',
  duaa: 'var(--color-gold-light)',
  habits: 'var(--color-info)',
};

const SIZE = 192;
const STROKE = 9;
const GAP = 3;

/** Concentric per-module rings (hand-built SVG) with the overall % inside. */
export const DailyRing = React.memo(function DailyRing({ modules, overallValue }: DailyRingProps) {
  const { t } = useI18n();
  const rings = modules.slice(0, 5);

  return (
    <div className="relative flex flex-col items-center">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90" aria-hidden>
          {rings.map((m, i) => {
            const r = SIZE / 2 - STROKE / 2 - i * (STROKE + GAP);
            const c = 2 * Math.PI * r;
            const v = Math.min(100, Math.max(0, m.value));
            return (
              <g key={m.moduleId}>
                <circle cx={SIZE / 2} cy={SIZE / 2} r={r} fill="none" stroke="var(--color-track)" strokeWidth={STROKE} />
                <circle
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={r}
                  fill="none"
                  stroke={MODULE_COLORS[m.moduleId]}
                  strokeWidth={STROKE}
                  strokeLinecap="round"
                  strokeDasharray={c}
                  strokeDashoffset={c - (v / 100) * c}
                  className="transition-[stroke-dashoffset] duration-700 ease-out"
                />
              </g>
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-3xl font-bold text-teal dark:text-teal-light font-counter">
            {toArabicDigits(overallValue)}٪
          </span>
          <span className="text-xs text-text-muted mt-0.5">{t('overall')}</span>
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-2 mt-3">
        {rings.map((m) => (
          <span key={m.moduleId} className="inline-flex items-center gap-1 text-[11px] text-text-secondary">
            <span className="w-2 h-2 rounded-full" style={{ background: MODULE_COLORS[m.moduleId] }} />
            {m.label}
          </span>
        ))}
      </div>
    </div>
  );
});
