import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ChevronLeft, Crown, Medal, RefreshCw, Trophy, Wheat } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Medallion, SectionTitle } from '@/components/ui/Ornament';
import { useSettingsStore } from '@/store/settingsStore';
import { isSupabaseConfigured } from '@/services/supabaseClient';
import { bestStanding, periodRange, refreshBoard, useDayScore, useLeaderboardStore, useLocalTotals, type LbPeriod, type LbRow } from '@/services/leaderboard';
import { harvestOf, raceOf, verdictOf } from '@/services/selfRace';
import { toArabicDigits } from '@/utils/arabicFormat';
import { CrownEmblem, PersonCrown, useMyEmblem } from '@/components/crowns/CrownEmblem';
import { crownTitle, streakText } from '@/services/crowns';

const ar = toArabicDigits;

export const TIER_TITLE: Record<1 | 3 | 10, string> = { 1: 'المركز الأول', 3: 'من الثلاثة الأوائل', 10: 'من العشرة الأوائل' };
export const TIER_ICON = { 1: Crown, 3: Medal, 10: Trophy } as const;
export const PERIOD_LABEL: Record<LbPeriod, string> = { today: 'اليوم', yesterday: 'أمس', week: 'هذا الأسبوع', month: 'هذا الشهر' };

/** «٣ من ٤٢» — or a dash before the first point of the period. */
export const rankOf = (r: LbRow | null | undefined) => (r ? `${ar(r.rank)} من ${ar(r.total)}` : '—');
export const nameOf = (r: LbRow) => (r.isMe ? 'أنت' : (r.name ?? 'مجهول'));

/**
 * The decoration: a crown I wear right now («تاج الأسبوع ×٣», see crowns.ts),
 * else a crown / medal / trophy chip for a place worth celebrating (first, top
 * three, top ten — see tierOf), today, this week or yesterday.
 * `rank`: otherwise show today's plain place (Home header, Me hero) so the
 * board is always one tap away. `onAccent` for the teal hero cards.
 */
export function StandingChip({
  onAccent = false,
  link = true,
  rank = false,
  named = false,
}: {
  onAccent?: boolean;
  link?: boolean;
  rank?: boolean;
  /** Under my name, which already wears the emblem: the crown in words only. */
  named?: boolean;
}) {
  const navigate = useNavigate();
  const mine = useLeaderboardStore((s) => s.mine);
  const join = useSettingsStore((s) => s.leaderboardJoin);
  const crown = useMyEmblem();
  const st = join ? bestStanding(mine) : null;
  const today = join && rank ? mine.today : null;
  if (crown) {
    const top = crown.periods[crown.periods.length - 1];
    const cls = [
      'inline-flex items-center gap-1.5 rounded-full min-h-7 text-[11px] font-bold',
      named ? 'px-3' : 'ps-1.5 pe-2.5',
      onAccent
        ? 'bg-on-accent/12 ring-1 ring-gold-light/70 text-on-accent'
        : 'bg-[image:var(--gradient-gold-soft)] ring-1 ring-gold/45 text-gold-dark dark:text-gold-light',
    ].join(' ');
    const body = named ? (
      <>
        {crownTitle(crown.periods)}
        {crown.streak ? <span className="font-semibold opacity-85">· {streakText(crown.streak.period, crown.streak.n)}</span> : null}
      </>
    ) : (
      <>
        <CrownEmblem emblem={crown} size={15} />
        {crownTitle(crown.periods)}
        {crown.streak ? <span className="font-counter tabular-nums">×{ar(crown.streak.n)}</span> : null}
      </>
    );
    if (!link) return <span className={cls}>{body}</span>;
    return (
      <button type="button" onClick={() => navigate(`/leaderboard?tab=${top === 'day' ? 'today' : top}`)} className={cls}>
        {body}
      </button>
    );
  }
  if (!st && !today) return null;
  const Icon = st ? TIER_ICON[st.tier] : Trophy;
  const tone =
    st?.tier === 1
      ? 'bg-[image:var(--gradient-gold)] text-[#2a1d05] shadow-[var(--shadow-glow-gold)]'
      : onAccent
        ? 'bg-on-accent/12 ring-1 ring-gold-light/40 text-gold-light'
        : st?.tier === 3
          ? 'bg-gold/15 ring-1 ring-gold/35 text-gold-dark dark:text-gold-light'
          : 'bg-teal/10 ring-1 ring-teal/20 text-teal dark:text-teal-light';
  const cls = ['inline-flex items-center gap-1 rounded-full px-2.5 min-h-7 text-[11px] font-bold', tone].join(' ');
  const body = (
    <>
      <Icon size={13} strokeWidth={2.4} aria-hidden />
      {st ? `${TIER_TITLE[st.tier]} · ${PERIOD_LABEL[st.period]}` : `ترتيبك اليوم ${rankOf(today)}`}
    </>
  );
  if (!link) return <span className={cls}>{body}</span>;
  return (
    <button type="button" onClick={() => navigate(`/leaderboard?tab=${st?.period ?? 'today'}`)} className={cls}>
      {body}
    </button>
  );
}

/** «تحديث الترتيب»: pull مصحفي, upload, re-read the places — spins while it works. */
export function RefreshButton({ onDone, onAccent = false }: { onDone?: () => void; onAccent?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      aria-label="تحديث الترتيب"
      title="تحديث الترتيب"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await refreshBoard();
          onDone?.();
        } finally {
          setBusy(false);
        }
      }}
      className={[
        'w-9 h-9 inline-flex items-center justify-center rounded-full transition-colors disabled:opacity-70',
        onAccent ? 'text-on-accent hover:bg-on-accent/10' : 'text-teal dark:text-teal-light hover:bg-teal/10',
      ].join(' ')}
    >
      <RefreshCw size={16} className={busy ? 'animate-spin' : ''} aria-hidden />
    </button>
  );
}

/**
 * «المتنافسون» on Home, high up: today's points (live, local), my place today
 * and this week, and today's first three. No account needed (guest identity,
 * see leaderboard.ts). Hidden only when the user left the board.
 */
export function LeaderboardHomeCard() {
  const navigate = useNavigate();
  const join = useSettingsStore((s) => s.leaderboardJoin);
  const status = useLeaderboardStore((s) => s.status);
  const mine = useLeaderboardStore((s) => s.mine);
  const top = useLeaderboardStore((s) => s.top);
  const score = useDayScore(periodRange('today')[0]);
  const crown = useMyEmblem();
  const totals = useLocalTotals();
  const female = useSettingsStore((s) => s.gender) === 'female';
  const self = useMemo(() => verdictOf(raceOf('today', totals), female), [totals, female]);
  if (!isSupabaseConfigured || !join) return null;

  const st = bestStanding(mine);
  const Icon = st ? TIER_ICON[st.tier] : Trophy;
  const note =
    top.length > 0
      ? null
      : status === 'missing'
        ? 'الترتيب قيد التجهيز، ونقاطك محفوظة حتى يُفتح'
        : status === 'signin'
          ? 'سجّل الدخول بحسابك في جوجل ليظهر ترتيبك'
          : status === 'offline'
            ? 'اتصل بالإنترنت لترى المتنافسين'
            : status === 'ok'
              ? 'لم يسبقك أحدٌ اليوم — كن أول المتنافسين'
              : null;

  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle
        title="المتنافسون"
        subtitle="﴿وَفِي ذَٰلِكَ فَلْيَتَنَافَسِ الْمُتَنَافِسُونَ﴾"
        action={
          <span className="inline-flex items-center gap-1">
            <RefreshButton />
            <button
              type="button"
              onClick={() => navigate('/leaderboard')}
              className="inline-flex items-center gap-0.5 text-xs font-semibold text-teal dark:text-teal-light min-h-9 px-1"
            >
              الترتيب كاملاً <ChevronLeft size={14} />
            </button>
          </span>
        }
      />
      <Card variant="gradient-edge" className="p-1.5">
        <button
          type="button"
          onClick={() => navigate('/leaderboard')}
          className="relative w-full text-start rounded-[var(--radius-inner)] p-2.5 flex flex-col gap-3"
        >
          <span className="flex items-center gap-3">
            <Medallion size={54} tone="gold">
              {crown ? (
                <CrownEmblem emblem={crown} size={crown.periods.length > 1 || crown.periods[0] !== 'day' ? 21 : 24} />
              ) : (
                <Icon size={20} className="text-gold-dark dark:text-gold-light" aria-hidden />
              )}
            </Medallion>
            <span className="flex-1 min-w-0 flex flex-col">
              <span className="text-[11px] text-text-muted">نقاطك اليوم</span>
              <span className="font-counter text-[28px] font-bold leading-tight tabular-nums text-gold-dark dark:text-gold-light">
                {ar(score.total)}
              </span>
              {/* «سباقك مع نفسك» in one line: today against yesterday. */}
              <span className="text-[10.5px] text-text-muted truncate">{self.text}</span>
            </span>
            <span className="flex flex-col items-end text-end shrink-0">
              <span className="text-[11px] text-text-muted">ترتيبك اليوم</span>
              <span className="font-counter text-[17px] font-bold tabular-nums text-text-primary dark:text-text-on-dark">
                {rankOf(mine.today)}
              </span>
              <span className="text-[10.5px] text-text-muted">الأسبوع: {rankOf(mine.week)}</span>
              <span className="text-[10.5px] text-text-muted">الشهر: {rankOf(mine.month)}</span>
            </span>
          </span>
          {st || crown ? (
            <span className="flex">
              <StandingChip link={false} />
            </span>
          ) : null}
          {top.length ? (
            <ol aria-label="الثلاثة الأوائل اليوم" className="flex flex-col gap-1">
              {top.map((r) => (
                <li
                  key={`${r.rank}-${r.tag}`}
                  className={[
                    'flex items-center gap-2.5 rounded-xl px-2.5 py-1.5',
                    r.isMe ? 'bg-gold/12 ring-1 ring-gold/35' : 'bg-white/55 dark:bg-white/[0.04]',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'w-6 h-6 rounded-full inline-flex items-center justify-center text-[11px] font-bold font-counter shrink-0',
                      r.rank === 1 ? 'bg-[image:var(--gradient-gold)] text-[#2a1d05]' : 'bg-teal/12 text-teal dark:text-teal-light',
                    ].join(' ')}
                  >
                    {r.rank === 1 ? <Crown size={12} aria-label="الأول" /> : ar(r.rank)}
                  </span>
                  <span
                    className={[
                      'flex-1 min-w-0 flex items-center gap-1.5 text-[13px] font-semibold',
                      r.isMe ? 'text-gold-dark dark:text-gold-light' : 'text-text-primary dark:text-text-on-dark',
                    ].join(' ')}
                  >
                    <span className="truncate">{nameOf(r)}</span>
                    <PersonCrown who={r} size={15} />
                  </span>
                  <span className="font-counter tabular-nums text-[13px] font-bold text-text-secondary dark:text-text-on-dark/85">
                    {ar(r.points)}
                  </span>
                </li>
              ))}
            </ol>
          ) : note ? (
            <span className="text-[12px] text-text-muted text-pretty">{note}</span>
          ) : null}
        </button>
      </Card>
    </section>
  );
}

/**
 * «حصاد أسبوعك» on Home — Friday from noon through Saturday, when the week
 * had points: the total and the change, one tap to /harvest.
 */
export function HarvestHomeCard() {
  const navigate = useNavigate();
  const totals = useLocalTotals();
  const h = useMemo(() => harvestOf(totals), [totals]);
  const now = new Date();
  const day = now.getDay();
  if (!((day === 5 && now.getHours() >= 12) || day === 6) || !h.total) return null;
  return (
    <Card variant="gradient-edge" className="p-1.5">
      <button
        type="button"
        onClick={() => navigate('/harvest')}
        className="relative w-full flex items-center gap-3 rounded-[var(--radius-inner)] p-2.5 text-start"
      >
        <Medallion size={50} tone="gold">
          <Wheat size={20} className="text-gold-dark dark:text-gold-light" aria-hidden />
        </Medallion>
        <span className="flex-1 min-w-0 flex flex-col">
          <span className="text-[11px] text-text-muted">{h.range}</span>
          <span className="text-[15px] font-bold text-text-primary dark:text-text-on-dark">{h.live ? 'حصاد أسبوعك جاهز' : 'حصاد أسبوعك الذي مضى'}</span>
          <span className="text-[12px] text-text-secondary dark:text-text-on-dark/80">
            <span className="font-counter tabular-nums font-bold text-gold-dark dark:text-gold-light">{ar(h.total)}</span> نقطة
            {h.delta != null ? ` · ${h.delta >= 0 ? '▲' : '▼'} ${ar(Math.abs(h.delta))}٪ عن الذي قبله` : ''}
            {h.newRecord ? ' · أفضل أسبوع لك' : ''}
          </span>
        </span>
        <ChevronLeft size={18} className="text-text-muted shrink-0" aria-hidden />
      </button>
    </Card>
  );
}
