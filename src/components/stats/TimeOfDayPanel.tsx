import { Clock3 } from 'lucide-react';
import { motion } from '@/lib/motion';
import { StatsPanel } from './StatsPanel';
import { toArabicDigits, CHART } from '@/services/statsService';

/** Day windows used for the plain-language read-out (hour ranges, wrap at 24). */
const WINDOWS: { label: string; from: number; to: number }[] = [
  { label: 'السَّحَر', from: 3, to: 5 },
  { label: 'الصباح', from: 5, to: 11 },
  { label: 'الظهيرة', from: 11, to: 15 },
  { label: 'العصر', from: 15, to: 18 },
  { label: 'المغرب', from: 18, to: 20 },
  { label: 'الليل', from: 20, to: 27 },
];

const inWindow = (h: number, w: { from: number; to: number }) => {
  const hh = h < w.from ? h + 24 : h;
  return hh >= w.from && hh < w.to;
};

interface TimeOfDayPanelProps {
  /** 24 buckets — index = local hour. */
  hours: number[];
  title?: string;
  subtitle?: string;
  emptyText?: string;
  /** Optional highlighted arc (e.g. the last third of the night). */
  band?: { from: number; to: number; label: string };
}

/**
 * «متى تتعبّد؟» — a 24-hour radial clock (midnight at the top, clockwise)
 * built from the timed activity log, plus the share of each part of the day.
 */
export function TimeOfDayPanel({
  hours,
  title = 'أوقاتك في اليوم',
  subtitle = 'من سجلّ النشاط المؤقَّت',
  emptyText = 'تظهر أوقاتك هنا بعد تسجيل بعض النشاط.',
  band,
}: TimeOfDayPanelProps) {
  const total = hours.reduce((s, v) => s + v, 0);
  const max = Math.max(1, ...hours);
  const peak = hours.indexOf(Math.max(...hours));

  const S = 200;
  const C = S / 2;
  const R0 = 40;
  const L = 44;
  const polar = (h: number, r: number) => {
    const a = ((h / 24) * 360 - 90) * (Math.PI / 180);
    return [C + r * Math.cos(a), C + r * Math.sin(a)] as const;
  };
  const arc = (from: number, to: number, r: number) => {
    const [x1, y1] = polar(from, r);
    const [x2, y2] = polar(to, r);
    const span = ((to - from + 24) % 24) / 24;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${span > 0.5 ? 1 : 0} 1 ${x2} ${y2}`;
  };

  const windows = WINDOWS.map((w) => ({
    ...w,
    v: hours.reduce((s, v, h) => s + (inWindow(h, w) ? v : 0), 0),
  }));
  const topWindow = [...windows].sort((a, b) => b.v - a.v)[0];

  return (
    <StatsPanel title={title} subtitle={subtitle} icon={<Clock3 size={16} />}>
      {total === 0 ? (
        <p className="text-[12px] text-text-muted text-center py-6">{emptyText}</p>
      ) : (
        <div className="flex items-center gap-4">
          <svg viewBox={`0 0 ${S} ${S}`} className="w-40 h-40 shrink-0" role="img" aria-label="توزيع النشاط على ساعات اليوم">
            <circle cx={C} cy={C} r={R0 + L} fill="none" stroke={CHART.track} strokeWidth={1} />
            <circle cx={C} cy={C} r={R0 - 6} fill="none" stroke={CHART.track} strokeWidth={1} />
            {band ? (
              <path d={arc(band.from, band.to, R0 + L + 5)} fill="none" stroke={CHART.gold} strokeWidth={3} strokeLinecap="round" opacity={0.8} />
            ) : null}
            {hours.map((v, h) => {
              const len = v > 0 ? 4 + (v / max) * (L - 4) : 1.5;
              const [x1, y1] = polar(h + 0.5, R0);
              const [x2, y2] = polar(h + 0.5, R0 + len);
              return (
                <motion.line
                  key={h}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={h === peak ? CHART.gold : v > 0 ? CHART.teal : CHART.track}
                  strokeWidth={6.5}
                  strokeLinecap="round"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, delay: h * 0.015 }}
                />
              );
            })}
            {[0, 6, 12, 18].map((h) => {
              const [x, y] = polar(h, R0 - 16);
              return (
                <text key={h} x={x} y={y + 3} textAnchor="middle" fontSize={9} fill={CHART.muted} className="font-counter">
                  {toArabicDigits(h)}
                </text>
              );
            })}
          </svg>
          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            <p className="text-[12.5px] font-bold text-text-primary dark:text-text-on-dark text-pretty">
              أكثر أوقاتك: <span className="text-gold-dark dark:text-gold-light">{topWindow.label}</span>
            </p>
            <p className="text-[11px] text-text-muted">
              الذروة حول الساعة {toArabicDigits(peak % 12 || 12)} {peak < 12 ? 'صباحاً' : 'مساءً'}
            </p>
            <div className="mt-1 flex flex-col gap-1">
              {windows.map((w) => {
                const pct = Math.round((w.v / total) * 100);
                return (
                  <div key={w.label} className="flex items-center gap-2 text-[11px]">
                    <span className="w-14 shrink-0 text-text-secondary dark:text-text-on-dark/80">{w.label}</span>
                    <span className="flex-1 h-1.5 rounded-full bg-track overflow-hidden">
                      <span
                        className="block h-full rounded-full"
                        style={{ width: `${pct}%`, background: w === topWindow ? CHART.gold : CHART.teal }}
                      />
                    </span>
                    <span className="w-8 text-end font-counter text-text-muted tabular-nums">{toArabicDigits(pct)}٪</span>
                  </div>
                );
              })}
            </div>
            {band ? (
              <p className="text-[10px] text-text-muted mt-1 inline-flex items-center gap-1">
                <span className="w-3 h-0.5 rounded-full bg-gold" /> {band.label}
              </p>
            ) : null}
          </div>
        </div>
      )}
    </StatsPanel>
  );
}
