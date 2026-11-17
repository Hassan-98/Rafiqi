import React, { useEffect } from 'react';
import { motion, useMotionValue, useTransform, animate } from '@/lib/motion';
import { useI18n } from '@/hooks/useI18n';

interface ConsistencyScoreProps {
  score: number;      // 0–100
  messageKey?: string;
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'var(--color-teal)';
  if (score >= 50) return 'var(--color-gold)';
  return '#E07B54';
}

function getScoreGrade(score: number): string {
  if (score >= 90) return 'ممتاز';
  if (score >= 75) return 'جيد جداً';
  if (score >= 60) return 'جيد';
  if (score >= 40) return 'مقبول';
  return 'يحتاج تحسين';
}

export const ConsistencyScore = React.memo(function ConsistencyScore({ score, messageKey }: ConsistencyScoreProps) {
  const { t } = useI18n();
  const clamped = Math.min(100, Math.max(0, score));
  const motionScore = useMotionValue(0);
  const displayScore = useTransform(motionScore, (v) => Math.round(v).toString());

  useEffect(() => {
    const ctrl = animate(motionScore, clamped, { duration: 1.2, ease: 'easeOut' });
    return ctrl.stop;
  }, [clamped, motionScore]);

  const color = getScoreColor(clamped);
  const grade = getScoreGrade(clamped);

  // Semicircle gauge: 180-degree arc
  const radius = 60;
  const circumference = Math.PI * radius; // half circle
  const dashOffset = circumference - (clamped / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Gauge */}
      <div className="relative" style={{ width: 160, height: 90 }}>
        <svg width="160" height="90" viewBox="0 0 160 90" aria-hidden="true">
          {/* Track */}
          <path
            d="M 10 80 A 70 70 0 0 1 150 80"
            fill="none" stroke="var(--color-cream-dark)" strokeWidth="12" strokeLinecap="round"
          />
          {/* Progress */}
          <motion.path
            d="M 10 80 A 70 70 0 0 1 150 80"
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={circumference}
            animate={{ strokeDashoffset: dashOffset }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          />
        </svg>

        {/* Center number */}
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center pb-1">
          <motion.span className="text-3xl font-bold font-counter" style={{ color }}>
            {displayScore}
          </motion.span>
        </div>
      </div>

      {/* Grade badge */}
      <span
        className="text-sm font-semibold px-3 py-1 rounded-full"
        style={{ color, background: `${color}20` }}
      >
        {grade}
      </span>

      {/* Motivational message */}
      {messageKey && (
        <p className="text-sm text-text-secondary dark:text-gray-400 text-center max-w-xs">
          {t(messageKey)}
        </p>
      )}
    </div>
  );
});
