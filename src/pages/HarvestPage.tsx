import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { CalendarCheck, Crown, Flag, ScrollText, Sprout, Trophy } from 'lucide-react';
import { TopAppBar } from '@/components/layout/TopAppBar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ArchMotif, Medallion, OrnamentRule, SectionTitle, Star8 } from '@/components/ui/Ornament';
import { useSettingsStore } from '@/store/settingsStore';
import { useAuthStore } from '@/store/authStore';
import { isSupabaseConfigured } from '@/services/supabaseClient';
import { fetchRange, localScore, useLocalTotals, type LbRow } from '@/services/leaderboard';
import { harvestOf, pointsText } from '@/services/selfRace';
import { winnerOf } from '@/services/crowns';
import { useBadgeMetricsStore } from '@/services/BadgeEngine';
import type { ScorePart } from '@/services/leaderboardScore';
import { toArabicDigits as ar } from '@/utils/arabicFormat';

/**
 * «حصاد الأسبوع» — /harvest. Friday: the running week; any other day: the
 * week that ended (selfRace.harvestOf). The week's points against the one
 * before, its seven days, the doors they came from, the place on the board,
 * and next week's mark. Opened from the Friday-evening notification, Home
 * (Friday → Saturday) and «الترتيب».
 */
export function HarvestPage() {
  const navigate = useNavigate();
  const totals = useLocalTotals();
  const metrics = useBadgeMetricsStore((s) => s.metrics);
  const join = useSettingsStore((s) => s.leaderboardJoin);
  const female = useSettingsStore((s) => s.gender) === 'female';
  // The board needs the identity: before the session is restored `who()` has none.
  const authReady = useAuthStore((s) => s.ready);
  const user = useAuthStore((s) => s.user);
  const h = useMemo(() => harvestOf(totals), [totals]);
  const [board, setBoard] = useState<LbRow[] | null>(null);

  const parts = useMemo(() => {
    const sum = new Map<string, ScorePart>();
    for (const d of h.days) {
      if (d.future) continue;
      for (const x of localScore(d.key).parts) {
        const had = sum.get(x.id);
        sum.set(x.id, { ...x, points: (had?.points ?? 0) + x.points });
      }
    }
    return [...sum.values()].sort((a, b) => b.points - a.points);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- metrics is the change trigger
  }, [h.start, metrics]);

  useEffect(() => {
    if (!isSupabaseConfigured || !join || !authReady) return;
    let live = true;
    void fetchRange(h.start, h.end, 3).then((r) => live && setBoard(r));
    return () => {
      live = false;
    };
  }, [h.start, h.end, join, authReady, user]);

  const me = board?.find((r) => r.isMe) ?? null;
  const champion = board ? winnerOf(board) : null;
  const max = Math.max(1, ...h.days.map((d) => d.points));
  const up = h.delta != null && h.delta >= 0;

  if (!h.total && !h.prevTotal) {
    return (
      <div className="min-h-dvh bg-cream dark:bg-dark-bg">
        <TopAppBar title="حصاد الأسبوع" subtitle={h.range} showBack />
        <div className="px-4 pt-6 max-w-3xl mx-auto">
          <Card>
            <EmptyState
              illustration={
                <Medallion size={72} tone="gold">
                  <Sprout size={24} className="text-gold" />
                </Medallion>
              }
              title="لا حصاد بعد"
              description="ما تزرعه هذا الأسبوع من صلاةٍ وذكرٍ وورد تحصده هنا يوم الجمعة."
              cta={{ label: 'إلى الترتيب', onClick: () => navigate('/leaderboard') }}
            />
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-cream dark:bg-dark-bg">
      <TopAppBar title="حصاد الأسبوع" subtitle={h.range} showBack />
      <div className="flex flex-col gap-6 px-4 pt-4 pb-28 max-w-3xl mx-auto">
        {/* ── The harvest: the total, against last week, the seven days ── */}
        <Card variant="night" className="p-5 overflow-hidden">
          <ArchMotif className="absolute -top-4 -start-6 w-32 h-40 text-gold opacity-[0.13]" />
          <ArchMotif className="absolute -top-4 -end-6 w-32 h-40 text-gold opacity-[0.13] -scale-x-100" />
          <div className="relative flex flex-col items-center text-center">
            <span className="text-[12px] text-gold-light/90">{h.live ? 'أسبوعك حتى الآن' : 'أسبوعك الذي مضى'}</span>
            <span className="mt-1 font-counter text-[54px] font-bold leading-none tabular-nums text-text-on-dark">{ar(h.total)}</span>
            <span className="mt-1 text-[13px] text-text-on-dark/75">نقطة في سبعة أيام</span>
            <span className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {h.delta != null ? (
                <span
                  className={[
                    'inline-flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-bold',
                    up ? 'bg-white/[0.08] ring-1 ring-gold-light/40 text-gold-light' : 'bg-white/[0.06] ring-1 ring-white/10 text-text-on-dark/80',
                  ].join(' ')}
                >
                  {up ? '▲' : '▼'} {ar(Math.abs(h.delta))}٪ عن الأسبوع الذي قبله ({ar(h.prevTotal)})
                </span>
              ) : null}
              {h.newRecord ? (
                <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-bold bg-[image:var(--gradient-gold)] text-[#2a1d05] shadow-[var(--shadow-glow-gold)]">
                  <Trophy size={13} aria-hidden /> أفضل أسبوع لك
                </span>
              ) : null}
            </span>
          </div>

          <ol className="relative mt-6 grid grid-cols-7 items-end gap-1.5 h-32" aria-label="أيام الأسبوع">
            {h.days.map((d) => (
              <li
                key={d.key}
                className="flex flex-col items-center justify-end gap-1 h-full min-w-0"
                aria-label={`${d.label}: ${d.future ? 'لم يأتِ بعد' : ar(d.points)}${d.best ? '، أفضل أيامك' : ''}`}
              >
                {d.best ? <Star8 size={14} className="text-gold-light" /> : <span className="h-3.5" aria-hidden />}
                <span className="font-counter tabular-nums text-[10.5px] font-bold text-text-on-dark/85">{d.points ? ar(d.points) : ''}</span>
                <span
                  aria-hidden
                  className={[
                    'w-[70%] rounded-t-md',
                    d.future ? 'bg-white/[0.06] border border-dashed border-white/15' : d.best ? 'bg-[image:var(--gradient-gold)]' : d.points ? 'bg-teal-light/45' : 'bg-white/[0.08]',
                  ].join(' ')}
                  style={{ height: d.future ? '18%' : `${Math.max(5, (d.points / max) * 62)}%` }}
                />
                <span className="text-[9.5px] text-text-on-dark/65 truncate max-w-full">{d.label.replace('ال', '')}</span>
              </li>
            ))}
          </ol>
        </Card>

        {/* ── The numbers ── */}
        <div className="grid grid-cols-2 gap-2.5">
          <Fact icon={<CalendarCheck size={18} />} label="أيام العمل" value={`${ar(h.activeDays)} من ٧`}>
            <span className="flex gap-1 mt-1" aria-hidden>
              {h.days.map((d) => (
                <span key={d.key} className={['w-2 h-2 rounded-full', d.points ? 'bg-gold' : 'bg-cream-dark dark:bg-white/10'].join(' ')} />
              ))}
            </span>
          </Fact>
          <Fact icon={<Star8 size={16} />} label="أفضل أيامك" value={h.best ? h.best.label : '—'} sub={h.best ? pointsText(h.best.points) : undefined} />
          {me ? (
            <Fact
              icon={<Crown size={18} />}
              label="مكانك في الترتيب"
              value={`${ar(me.rank)} من ${ar(me.total)}`}
              sub={champion?.isMe ? (h.live ? 'تاج الأسبوع معك حتى الآن' : 'نلت تاج الأسبوع') : champion ? `${h.live ? 'المتصدّر' : 'صاحب التاج'}: ${champion.name ?? 'مجهول'}` : undefined}
              gold={!!champion?.isMe}
            />
          ) : null}
          <Fact icon={<Flag size={18} />} label="أفضل أسبوع قبله" value={h.record ? ar(h.record.points) : '—'} sub={h.record?.label} wide={!me} />
        </div>

        {/* ── The doors it came from ── */}
        {parts.length ? (
          <section className="flex flex-col gap-2.5">
            <SectionTitle title="من أين جاء حصادك" subtitle="أكثر ما أعطاك هذا الأسبوع" />
            <Card className="p-1.5">
              <ol className="flex flex-col">
                {parts.slice(0, 5).map((x, i) => (
                  <li key={x.id} className="flex items-center gap-3 px-3 py-2.5">
                    <span
                      className={[
                        'w-7 h-7 rounded-lg inline-flex items-center justify-center font-counter text-[12px] font-bold shrink-0',
                        i === 0 ? 'bg-[image:var(--gradient-gold)] text-[#2a1d05]' : 'bg-teal/10 text-teal dark:text-teal-light',
                      ].join(' ')}
                    >
                      {ar(i + 1)}
                    </span>
                    <span className="flex-1 min-w-0 flex flex-col gap-1">
                      <span className="text-[13px] font-semibold text-text-primary dark:text-text-on-dark truncate">{x.label}</span>
                      <span className="h-1.5 rounded-full bg-cream-dark/70 dark:bg-dark-surface overflow-hidden" aria-hidden>
                        <span className="block h-full rounded-full bg-teal/45 dark:bg-teal-light/45" style={{ width: `${(x.points / parts[0].points) * 100}%` }} />
                      </span>
                    </span>
                    <span className="font-counter tabular-nums text-[14px] font-bold text-gold-dark dark:text-gold-light">{ar(x.points)}</span>
                  </li>
                ))}
              </ol>
            </Card>
          </section>
        ) : null}

        {/* ── Next week ── */}
        <Card variant="gradient-edge" className="p-5 flex flex-col items-center text-center gap-2">
          <span className="text-[12px] font-semibold text-gold-dark dark:text-gold-light">الأسبوع القادم</span>
          <span className="font-display text-[20px] font-bold text-text-primary dark:text-text-on-dark text-balance">
            {h.total ? (
              <>
                {female ? 'تجاوزي' : 'تجاوز'} <span className="font-counter tabular-nums">{ar(h.nextGoal)}</span> نقطة
              </>
            ) : (
              'ابدأ بيومٍ واحد، ثم زِده'
            )}
          </span>
          <OrnamentRule className="w-40 my-1" />
          <p className="font-ornate text-[16px] text-text-secondary dark:text-text-on-dark/85 text-pretty">«أحبُّ الأعمال إلى الله أدومُها وإن قلّ»</p>
          <span className="text-[11px] text-text-muted">متفق عليه</span>
        </Card>

        <div className="grid grid-cols-2 gap-2.5">
          <Button variant="primary" leftIcon={<ScrollText size={16} />} onClick={() => navigate('/friday-review')}>
            محاسبة الجمعة
          </Button>
          <Button variant="soft" leftIcon={<Trophy size={16} />} onClick={() => navigate('/leaderboard?tab=week')}>
            الترتيب
          </Button>
        </div>
      </div>
    </div>
  );
}

function Fact({
  icon,
  label,
  value,
  sub,
  gold = false,
  wide = false,
  children,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
  gold?: boolean;
  /** Spans both columns (when it would sit alone in a row). */
  wide?: boolean;
  children?: ReactNode;
}) {
  return (
    <Card variant={gold ? 'gold-rim' : 'plain'} className={['p-3.5 flex flex-col gap-1 min-w-0', wide ? 'col-span-2' : ''].join(' ')}>
      <span className="flex items-center gap-1.5 text-[11.5px] text-text-muted">
        <span className="text-gold-dark dark:text-gold-light" aria-hidden>
          {icon}
        </span>
        {label}
      </span>
      <span className="font-counter tabular-nums text-[18px] font-bold text-text-primary dark:text-text-on-dark truncate">{value}</span>
      {sub ? <span className="text-[11px] text-text-muted truncate">{sub}</span> : null}
      {children}
    </Card>
  );
}

export default HarvestPage;
