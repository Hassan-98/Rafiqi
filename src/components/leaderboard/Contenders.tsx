import { EyeOff } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Star8 } from '@/components/ui/Ornament';
import { PersonCrown } from '@/components/crowns/CrownEmblem';
import { nameOf } from '@/components/leaderboard/LeaderboardCards';
import { pointsText } from '@/services/selfRace';
import { toArabicDigits as ar } from '@/utils/arabicFormat';
import type { LbRow } from '@/services/leaderboard';

/**
 * «المتنافسون» — the board drawn for its size: two people face each other in a
 * duel (the usual field today), three or more stand on mihrab arches with the
 * rest listed under them, each bar measured against the first.
 */

/** The person's seal: a star for me, the first letter otherwise, an eye for a hidden name. */
function Avatar({ r, size = 48, gold = false }: { r: LbRow; size?: number; gold?: boolean }) {
  const letter = r.name ? Array.from(r.name.trim())[0] : null;
  return (
    <span
      className={[
        'relative inline-flex items-center justify-center rounded-full shrink-0 font-display font-bold',
        gold || r.isMe ? 'bg-[image:var(--gradient-gold)] text-[#2a1d05] shadow-[var(--shadow-glow-gold)]' : 'bg-teal/12 text-teal dark:bg-teal/20 dark:text-teal-light',
        r.isMe && !gold ? 'ring-2 ring-gold/70 ring-offset-2 ring-offset-white dark:ring-offset-dark-card' : '',
      ].join(' ')}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden
    >
      {r.isMe ? <Star8 size={size * 0.46} /> : letter ? letter : <EyeOff size={size * 0.4} />}
    </span>
  );
}

function Name({ r, className = '' }: { r: LbRow; className?: string }) {
  return (
    <span className={['min-w-0 flex items-center justify-center gap-1', className].join(' ')}>
      <span className="truncate">{nameOf(r)}</span>
      <PersonCrown who={r} size={17} />
    </span>
  );
}

// ── two: the duel ──────────────────────────────────────────────────────────
export function Duel({ rows }: { rows: LbRow[] }) {
  const [a, b] = rows.some((r) => r.isMe) ? [rows.find((r) => r.isMe)!, rows.find((r) => !r.isMe)!] : rows;
  const sum = a.points + b.points;
  const share = sum ? a.points / sum : 0.5;
  const gap = Math.abs(a.points - b.points);
  const lead = a.points === b.points ? null : a.points > b.points ? a : b;
  const verdict = !lead
    ? 'متعادلان، والفاصل عملٌ واحد'
    : lead.isMe
      ? `أنت في المقدّمة بـ${pointsText(gap)}`
      : a.isMe
        ? `المتصدّر أمامك بـ${pointsText(gap)}`
        : `${nameOf(lead)} في المقدّمة بـ${pointsText(gap)}`;

  const side = (r: LbRow) => (
    <div className="flex flex-col items-center gap-2 min-w-0">
      <Avatar r={r} size={58} gold={lead === r} />
      <Name r={r} className={['text-[15.5px] font-bold max-w-full', r.isMe ? 'text-gold-dark dark:text-gold-light' : 'text-text-primary dark:text-text-on-dark'].join(' ')} />
      <span className="font-counter tabular-nums text-[28px] font-bold leading-none text-text-primary dark:text-text-on-dark">{ar(r.points)}</span>
    </div>
  );

  return (
    <Card variant="gradient-edge" className="p-4 flex flex-col gap-4">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        {side(a)}
        <span className="flex flex-col items-center gap-1 text-gold-dark dark:text-gold-light" aria-hidden>
          <Star8 size={22} filled={false} />
          <span className="font-ornate text-[13px] text-text-muted">مقابل</span>
        </span>
        {side(b)}
      </div>
      {/* The tug: my share from the right, theirs from the left, the knot where they meet. */}
      <div className="relative" role="img" aria-label={verdict}>
        <div className="flex h-3 rounded-full overflow-hidden bg-cream-dark/60 dark:bg-dark-surface">
          <span
            className="h-full bg-[image:var(--gradient-gold)] transition-[width] duration-700 ease-out-soft motion-reduce:transition-none"
            style={{ width: `${share * 100}%` }}
          />
          <span className="h-full flex-1 bg-teal/35 dark:bg-teal/45" />
        </div>
        <span
          aria-hidden
          className="absolute top-1/2 w-4 h-4 -translate-y-1/2 translate-x-1/2 rotate-45 rounded-[3px] bg-white dark:bg-dark-card ring-2 ring-gold transition-[right] duration-700 ease-out-soft motion-reduce:transition-none"
          style={{ right: `${share * 100}%` }}
        />
      </div>
      <p className="text-center text-[13.5px] font-semibold text-text-secondary dark:text-text-on-dark/85">{verdict}</p>
    </Card>
  );
}

// ── three or more: the arches ──────────────────────────────────────────────
const BODY: Record<number, string> = { 1: 'h-[5.25rem]', 2: 'h-16', 3: 'h-12' };

function Arch({ r }: { r: LbRow }) {
  const first = r.rank === 1;
  return (
    <li className="flex flex-col items-center gap-1.5 min-w-0">
      <Avatar r={r} size={first ? 54 : 44} gold={first} />
      <Name r={r} className={['w-full text-[14.5px] leading-tight font-bold', r.isMe ? 'text-gold-dark dark:text-gold-light' : 'text-text-primary dark:text-text-on-dark'].join(' ')} />
      <div className="w-full flex flex-col">
        {/* The pointed cap, then the column — the same tone where they meet. */}
        <svg viewBox="0 0 100 34" className={['w-full block -mb-px', first ? 'text-gold-light' : 'text-teal/15 dark:text-teal/25'].join(' ')} aria-hidden>
          <path d="M0 34V26C0 12 30 4 50 0c20 4 50 12 50 26v8Z" fill="currentColor" />
        </svg>
        <span
          className={[
            'w-full flex flex-col items-center justify-start pt-0.5 font-counter tabular-nums font-bold leading-none',
            BODY[r.rank] ?? 'h-12',
            first
              ? 'bg-gradient-to-b from-gold-light to-gold text-[#2a1d05] text-[22px]'
              : 'bg-teal/15 dark:bg-teal/25 text-teal-dark dark:text-teal-light text-[19px]',
          ].join(' ')}
        >
          {ar(r.points)}
          <span className={['mt-1 text-[10.5px] font-semibold', first ? 'text-[#2a1d05]/75' : 'text-text-muted'].join(' ')}>
            {first ? 'الأول' : r.rank === 2 ? 'الثاني' : 'الثالث'}
          </span>
        </span>
      </div>
    </li>
  );
}

export function Podium({ rows }: { rows: LbRow[] }) {
  const top = rows.filter((r) => r.rank <= 3).slice(0, 3);
  // 2nd · 1st · 3rd — the first in the middle (RTL: the second on the right).
  const order = [top.find((r) => r.rank === 2), top.find((r) => r.rank === 1), top.find((r) => r.rank === 3)];
  return (
    <Card className="px-3 pt-5 pb-0 overflow-hidden">
      <ol className="grid grid-cols-3 items-end gap-2.5" aria-label="الثلاثة الأوائل">
        {order.map((r, i) => (r ? <Arch key={`${r.rank}-${r.tag}`} r={r} /> : <li key={`empty-${i}`} aria-hidden />))}
      </ol>
    </Card>
  );
}

export function Rows({ rows, first }: { rows: LbRow[]; first: number }) {
  if (!rows.length) return null;
  return (
    <Card className="p-1.5">
      <ol className="flex flex-col">
        {rows.map((r, i) => (
          <li key={`${r.rank}-${r.tag}-${i}`}>
            {i > 0 && r.rank - rows[i - 1].rank > 1 ? (
              <p className="text-center text-text-muted text-xs py-1" aria-hidden>
                …
              </p>
            ) : null}
            <div className={['flex items-center gap-3 px-2.5 py-2.5 rounded-[var(--radius-inner)]', r.isMe ? 'bg-gold/10 ring-1 ring-gold/35' : ''].join(' ')}>
              <span className="w-8 text-center font-counter font-bold tabular-nums text-[14px] text-text-muted shrink-0">{ar(r.rank)}</span>
              <Avatar r={r} size={36} />
              <span className="flex-1 min-w-0 flex flex-col gap-1.5">
                <span className="flex items-center gap-1.5 text-[15px] font-semibold text-text-primary dark:text-text-on-dark min-w-0">
                  <span className="truncate">{nameOf(r)}</span>
                  <PersonCrown who={r} size={16} />
                </span>
                <span className="h-1.5 rounded-full bg-cream-dark/70 dark:bg-dark-surface overflow-hidden" aria-hidden>
                  <span
                    className={['block h-full rounded-full', r.isMe ? 'bg-[image:var(--gradient-gold)]' : 'bg-teal/45'].join(' ')}
                    style={{ width: `${first ? Math.max(3, (r.points / first) * 100) : 0}%` }}
                  />
                </span>
              </span>
              <span className="font-counter tabular-nums text-[16.5px] font-bold text-gold-dark dark:text-gold-light">{ar(r.points)}</span>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/** My place, pinned while the list scrolls — and what the next place costs. */
export function MeBar({ me, above }: { me: LbRow; above: LbRow | undefined }) {
  const gap = above ? above.points - me.points + 1 : 0;
  return (
    <div className="sticky bottom-4 z-10 rounded-2xl bg-[image:var(--gradient-teal)] text-on-accent shadow-[var(--shadow-md)] px-4 py-3 flex items-center justify-between gap-3">
      <span className="min-w-0 flex flex-col">
        <span className="text-[13px] font-bold">
          ترتيبك {ar(me.rank)} من {ar(me.total)}
        </span>
        {above && gap > 0 ? (
          <span className="text-[11.5px] text-on-accent/80 truncate">
            {pointsText(gap)} وتسبق {nameOf(above)}
          </span>
        ) : null}
      </span>
      <span className="font-counter tabular-nums text-[17px] font-bold text-gold-light shrink-0">{ar(me.points)}</span>
    </div>
  );
}
