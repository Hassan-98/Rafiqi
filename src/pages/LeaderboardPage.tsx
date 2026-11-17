import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { addDays, format, parseISO } from 'date-fns';
import { Crown, EyeOff, RefreshCw, Trophy } from 'lucide-react';
import { TopAppBar } from '@/components/layout/TopAppBar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { ArchMotif, Medallion, SectionTitle } from '@/components/ui/Ornament';
import { PERIOD_LABEL, RefreshButton, TIER_ICON, TIER_TITLE, nameOf, rankOf } from '@/components/leaderboard/LeaderboardCards';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { isSupabaseConfigured } from '@/services/supabaseClient';
import {
  fetchBoard,
  localScore,
  periodRange,
  pushScores,
  tierOf,
  useDayScore,
  useLeaderboardStore,
  type LbPeriod,
  type LbRow,
} from '@/services/leaderboard';
import { useBadgeMetricsStore } from '@/services/BadgeEngine';
import { LB_RULES, type DayScore, type ScorePart } from '@/services/leaderboardScore';
import { WEEKDAY_LABELS_AR } from '@/services/statsService';
import { toArabicDigits } from '@/utils/arabicFormat';

const ar = toArabicDigits;
const TABS: LbPeriod[] = ['today', 'yesterday', 'week', 'month'];
const TAB_LABEL: Record<LbPeriod, string> = { today: 'اليوم', yesterday: 'أمس', week: 'الأسبوع', month: 'الشهر' };
const timesAr = (n: number) => (n === 1 ? 'مرة' : n === 2 ? 'مرتين' : `${ar(n)} ${n <= 10 ? 'مرات' : 'مرة'}`);

/**
 * «الترتيب» — the day's / yesterday's / the week's (Saturday → today) / the month's ranking
 * between all users — no account needed (a guest identity per device, see
 * leaderboard.ts) — scored by the effort of each deed. The user's own points
 * and their breakdown are computed locally and work offline too.
 */
export function LeaderboardPage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') as LbPeriod | null;
  const tab: LbPeriod = raw && TABS.includes(raw) ? raw : 'today';
  const user = useAuthStore((s) => s.user);
  const join = useSettingsStore((s) => s.leaderboardJoin);
  const status = useLeaderboardStore((s) => s.status);
  const honors = useLeaderboardStore((s) => s.honors);
  const [rows, setRows] = useState<LbRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!isSupabaseConfigured || !join) return;
    let live = true;
    setLoading(true);
    void (async () => {
      await pushScores(); // our own row current before reading the board
      const r = await fetchBoard(tab, 50);
      if (live) {
        setRows(r);
        setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [tab, user, join, nonce]); // user: the identity changes on Google sign-in

  const me = rows?.find((r) => r.isMe) ?? null;
  const honorCount = useMemo(() => {
    const c = { 1: 0, 3: 0, 10: 0 };
    for (const t of Object.values(honors)) c[t]++;
    return c;
  }, [honors]);

  return (
    <div className="min-h-dvh bg-cream dark:bg-dark-bg" dir="rtl">
      <TopAppBar
        title="الترتيب"
        subtitle="اليوم، أمس، الأسبوع، والشهر"
        showBack
        actions={join ? <RefreshButton onDone={() => setNonce((n) => n + 1)} /> : null}
      />
      <div className="flex flex-col gap-6 px-4 pt-4 pb-28 max-w-3xl mx-auto">
        {/* ── Hero: the ayah, my points, my place ── */}
        <Card variant="night" className="p-5">
          <ArchMotif className="absolute -top-3 -start-5 w-32 h-40 text-gold opacity-[0.14]" />
          <p className="relative font-quran text-[19px] leading-loose text-gold-light text-center">
            ﴿وَفِي ذَٰلِكَ فَلْيَتَنَافَسِ الْمُتَنَافِسُونَ﴾
          </p>
          <PeriodPoints tab={tab} me={me} />
          {honorCount[1] + honorCount[3] + honorCount[10] > 0 ? (
            <p className="relative mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-text-on-dark/75">
              {([1, 3, 10] as const)
                .filter((t) => honorCount[t] > 0)
                .map((t) => {
                  const Icon = TIER_ICON[t];
                  return (
                    <span key={t} className="inline-flex items-center gap-1">
                      <Icon size={12} className="text-gold-light" aria-hidden />
                      {TIER_TITLE[t]} {timesAr(honorCount[t])}
                    </span>
                  );
                })}
            </p>
          ) : null}
        </Card>

        {/* ── Period tabs ── */}
        <div role="tablist" aria-label="فترة الترتيب" className="grid grid-cols-4 rounded-2xl bg-cream-dark/60 dark:bg-dark-surface p-1">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setParams({ tab: t }, { replace: true })}
              className={[
                'min-h-10 rounded-xl text-[13px] font-semibold transition-colors',
                tab === t
                  ? 'bg-white dark:bg-dark-card shadow-[var(--shadow-xs)] text-teal dark:text-teal-light'
                  : 'text-text-muted',
              ].join(' ')}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>

        <Board rows={rows} loading={loading} status={status} onRetry={() => setNonce((n) => n + 1)} />

        <Breakdown tab={tab} />

        <details className="group rounded-[var(--radius-card)] bg-white dark:bg-dark-card ring-1 ring-black/[0.04] dark:ring-white/[0.06] p-4">
          <summary className="cursor-pointer list-none flex items-center justify-between text-[14px] font-bold text-text-primary dark:text-text-on-dark min-h-8">
            كيف تُحتسب النقاط؟
            <span className="text-xs font-semibold text-teal dark:text-teal-light group-open:hidden">عرض</span>
          </summary>
          <p className="mt-2 text-[11.5px] text-text-muted leading-relaxed text-pretty">
            بحسب جهد العمل ومشقّته، ولأكثر الأبواب حدٌّ أعلى في اليوم. قيام الليل يُحسب لليلته (لمساء يومه). تُحسب النقاط مما تسجّله في التطبيق.
          </p>
          <dl className="mt-3 divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {LB_RULES.map((r) => (
              <div key={r.label} className="flex items-baseline justify-between gap-3 py-2 text-[12.5px]">
                <dt className="text-text-secondary dark:text-text-on-dark/80">{r.label}</dt>
                <dd className="font-counter tabular-nums font-bold text-gold-dark dark:text-gold-light text-end">{ar(r.points)}</dd>
              </div>
            ))}
          </dl>
        </details>

        <Privacy />

        <p className="text-center text-[11.5px] leading-relaxed text-text-muted text-pretty px-2">
          «إنما الأعمال بالنيات» — الترتيب حافزٌ على المسارعة في الخير لا ميزانٌ للقبول، فأخلص نيتك لله، ومن أحبّ أن يُخفي عمله فليُخفِ اسمه.
        </p>
      </div>
    </div>
  );
}

/** My points for the tab (local, live) and my place (from the board). */
function PeriodPoints({ tab, me }: { tab: LbPeriod; me: LbRow | null }) {
  const metrics = useBadgeMetricsStore((s) => s.metrics);
  const [from, to] = periodRange(tab);
  const points = useMemo(() => {
    let n = 0;
    for (let d = parseISO(from); format(d, 'yyyy-MM-dd') <= to; d = addDays(d, 1)) n += localScore(format(d, 'yyyy-MM-dd')).total;
    return n;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- metrics is the change trigger
  }, [from, to, metrics]);
  const tier = me ? tierOf(me) : null;
  const Icon = tier ? TIER_ICON[tier] : Trophy;
  return (
    <div className="relative mt-4 flex items-center gap-4">
      <Medallion size={76} tone="gold">
        <Icon size={26} className="text-gold-light" aria-hidden />
      </Medallion>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gold-light/85">نقاطك {PERIOD_LABEL[tab]}</p>
        <p className="font-counter text-[34px] font-bold leading-tight text-text-on-dark tabular-nums">{ar(points)}</p>
        <p className="text-[12px] text-text-on-dark/75">
          {me ? (
            <>
              ترتيبك {rankOf(me)}
              {tier ? <span className="text-gold-light font-bold"> · {TIER_TITLE[tier]}</span> : null}
            </>
          ) : (
            'سجّل عبادتك ليُكتب لك ترتيب'
          )}
        </p>
      </div>
    </div>
  );
}

function Board({ rows, loading, status, onRetry }: { rows: LbRow[] | null; loading: boolean; status: string; onRetry: () => void }) {
  const join = useSettingsStore((s) => s.leaderboardJoin);
  const setJoin = useSettingsStore((s) => s.setLeaderboardJoin);

  if (!isSupabaseConfigured) return null;
  if (!join) {
    return (
      <Card className="p-4 flex flex-col gap-3">
        <p className="text-sm text-text-primary dark:text-text-on-dark leading-relaxed text-pretty">
          أنت خارج الترتيب الآن، فلا تُرفع نقاطك ولا يظهر اسمك.
        </p>
        <Button variant="soft" fullWidth onClick={() => setJoin(true)}>
          انضم إلى الترتيب
        </Button>
      </Card>
    );
  }
  if (status === 'missing') {
    return (
      <Card className="p-4">
        <p className="text-sm text-text-secondary dark:text-text-on-dark/80 text-pretty">الترتيب قيد التجهيز، ونقاطك محفوظة هنا حتى يُفتح.</p>
      </Card>
    );
  }
  if (!rows && loading) {
    return (
      <Card className="p-3 flex flex-col gap-3" aria-busy>
        <Skeleton height={120} rounded="lg" />
        <Skeleton lines={4} />
      </Card>
    );
  }
  if (!rows) {
    return (
      <Card className="p-4 flex flex-col items-start gap-3">
        <p className="text-sm text-text-secondary dark:text-text-on-dark/80">تعذّر تحميل الترتيب، تحقق من اتصالك بالإنترنت.</p>
        <Button variant="soft" size="sm" leftIcon={<RefreshCw size={14} />} onClick={onRetry}>
          إعادة المحاولة
        </Button>
      </Card>
    );
  }
  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState
          illustration={
            <Medallion size={72} tone="gold">
              <Crown size={24} className="text-gold" />
            </Medallion>
          }
          title="لم يُسجَّل أحدٌ بعد"
          description="ابدأ بصلاتك أو أذكارك، وكن أول المتنافسين في هذه الفترة."
        />
      </Card>
    );
  }

  const podium = rows.filter((r) => r.rank <= 3).slice(0, 3);
  const rest = rows.filter((r) => !podium.includes(r));
  const me = rows.find((r) => r.isMe);
  // 2nd · 1st · 3rd — the first in the middle (RTL: the second on the right).
  const order = [podium[1], podium[0], podium[2]];

  return (
    <section className="flex flex-col gap-3">
      <SectionTitle title="المتنافسون" subtitle={`${ar(rows[0].total)} مشاركاً في هذه الفترة`} />
      <Card className="px-2 pt-4 pb-2">
        <ol className="grid grid-cols-3 items-end gap-2" aria-label="الثلاثة الأوائل">
          {order.map((r, i) =>
            r ? (
              <li key={`${r.rank}-${r.tag}`} className="flex flex-col items-center gap-1.5 min-w-0">
                <Medallion size={r.rank === 1 ? 64 : 52} tone={r.rank === 1 ? 'gold' : 'teal'}>
                  {r.rank === 1 ? <Crown size={22} className="text-gold" aria-hidden /> : <span className="text-lg">{ar(r.rank)}</span>}
                </Medallion>
                <span
                  className={[
                    'max-w-full truncate text-[12.5px] font-bold',
                    r.isMe ? 'text-gold-dark dark:text-gold-light' : 'text-text-primary dark:text-text-on-dark',
                  ].join(' ')}
                >
                  {nameOf(r)}
                </span>
                <span
                  className={[
                    'w-full rounded-t-xl flex items-start justify-center pt-2 font-counter tabular-nums text-[13px] font-bold',
                    r.rank === 1
                      ? 'h-16 bg-[image:var(--gradient-gold)] text-[#2a1d05]'
                      : r.rank === 2
                        ? 'h-12 bg-teal/12 text-teal dark:text-teal-light'
                        : 'h-9 bg-teal/8 text-teal dark:text-teal-light',
                    r.isMe ? 'ring-2 ring-gold/60' : '',
                  ].join(' ')}
                >
                  {ar(r.points)}
                </span>
              </li>
            ) : (
              <li key={`empty-${i}`} aria-hidden />
            ),
          )}
        </ol>
      </Card>

      {rest.length ? (
        <Card className="p-1.5 divide-y divide-black/[0.05] dark:divide-white/[0.06]">
          {rest.map((r, i) => (
            <div key={`${r.rank}-${r.tag}-${i}`}>
              {i > 0 && r.rank - rest[i - 1].rank > 1 && r.isMe ? (
                <p className="text-center text-text-muted text-xs py-1" aria-hidden>
                  …
                </p>
              ) : null}
              <Row r={r} />
            </div>
          ))}
        </Card>
      ) : null}

      {me && me.rank > 3 ? (
        <div className="sticky bottom-4 z-10 rounded-2xl bg-[image:var(--gradient-teal)] text-on-accent shadow-[var(--shadow-md)] px-4 py-3 flex items-center justify-between gap-3">
          <span className="text-[13px] font-bold">ترتيبك {rankOf(me)}</span>
          <span className="font-counter tabular-nums text-[15px] font-bold text-gold-light">{ar(me.points)} نقطة</span>
        </div>
      ) : null}
    </section>
  );
}

function Row({ r }: { r: LbRow }) {
  return (
    <div
      className={[
        'flex items-center gap-3 px-3 py-3 rounded-[var(--radius-inner)]',
        r.isMe ? 'bg-gold/10 ring-1 ring-gold/35' : '',
      ].join(' ')}
    >
      <span className="w-9 h-9 rounded-xl bg-teal/10 text-teal dark:text-teal-light inline-flex items-center justify-center font-counter font-bold tabular-nums text-[13px] shrink-0">
        {ar(r.rank)}
      </span>
      <span className="flex-1 min-w-0 flex items-center gap-1.5 text-sm font-semibold text-text-primary dark:text-text-on-dark">
        <span className="truncate">{nameOf(r)}</span>
        {!r.name && !r.isMe ? <EyeOff size={12} className="text-text-muted shrink-0" aria-label="اسم مخفي" /> : null}
      </span>
      <span className="font-counter tabular-nums text-[14px] font-bold text-gold-dark dark:text-gold-light">{ar(r.points)}</span>
    </div>
  );
}

/**
 * Where my points came from — the day's parts; for the week (owner: the same
 * details as a day) the parts summed over Saturday → today, after the week
 * day by day; for the month the parts summed over its 1st → today.
 */
function Breakdown({ tab }: { tab: LbPeriod }) {
  const [from, to] = periodRange(tab);
  const many = tab === 'week' || tab === 'month';
  const day = useDayScore(many ? to : from);
  const metrics = useBadgeMetricsStore((s) => s.metrics);
  const week = useMemo(() => {
    if (!many) return [];
    const out: { key: string; label: string; score: DayScore | null }[] = [];
    // The week: all seven bars (the days to come empty); the month: its days so far.
    for (let i = 0, d = parseISO(from); tab === 'week' ? i < 7 : format(d, 'yyyy-MM-dd') <= to; i++, d = addDays(d, 1)) {
      const key = format(d, 'yyyy-MM-dd');
      out.push({ key, label: WEEKDAY_LABELS_AR[d.getDay()], score: key <= to ? localScore(key) : null });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- metrics is the change trigger
  }, [tab, many, from, to, metrics]);
  const weekParts = useMemo(() => {
    const sum = new Map<string, ScorePart>();
    for (const d of week) for (const x of d.score?.parts ?? []) {
      const had = sum.get(x.id);
      sum.set(x.id, { ...x, points: (had?.points ?? 0) + x.points });
    }
    return [...sum.values()].sort((a, b) => b.points - a.points);
  }, [week]);

  if (tab === 'week') {
    const max = Math.max(1, ...week.map((d) => d.score?.total ?? 0));
    return (
      <>
        <section className="flex flex-col gap-2.5">
          <SectionTitle title="أسبوعك يوماً بيوم" subtitle="من السبت إلى الجمعة" />
          <Card className="p-4">
            <ol className="grid grid-cols-7 items-end gap-1.5 h-32" aria-label="نقاط كل يوم">
              {week.map((d) => (
                <li key={d.key} className="flex flex-col items-center justify-end gap-1 h-full min-w-0">
                  <span className="font-counter tabular-nums text-[10.5px] font-bold text-text-secondary dark:text-text-on-dark/80">
                    {d.score ? ar(d.score.total) : ''}
                  </span>
                  <span
                    className={['w-full rounded-t-md', d.key === to ? 'bg-[image:var(--gradient-gold)]' : 'bg-teal/25 dark:bg-teal/35'].join(' ')}
                    style={{ height: `${Math.max(4, ((d.score?.total ?? 0) / max) * 72)}%` }}
                  />
                  <span className="text-[9.5px] text-text-muted truncate max-w-full">{d.label.replace('ال', '')}</span>
                </li>
              ))}
            </ol>
          </Card>
        </section>
        <Parts parts={weekParts} subtitle="مجموع الأسبوع من السبت إلى اليوم" />
      </>
    );
  }

  if (tab === 'month') return <Parts parts={weekParts} subtitle="مجموع الشهر من أوله إلى اليوم" />;
  return <Parts parts={day.parts} subtitle={tab === 'today' ? 'تتحدّث مع كل عمل تسجّله' : 'نقاط الأمس'} />;
}

function Parts({ parts, subtitle }: { parts: ScorePart[]; subtitle: string }) {
  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle title="من أين جاءت نقاطك" subtitle={subtitle} />
      {parts.length ? (
        <Card className="p-1.5 divide-y divide-black/[0.05] dark:divide-white/[0.06]">
          {parts.map((x) => (
            <div key={x.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <span className="text-[13px] text-text-secondary dark:text-text-on-dark/85">{x.label}</span>
              <span className="font-counter tabular-nums text-[13.5px] font-bold text-gold-dark dark:text-gold-light">+{ar(x.points)}</span>
            </div>
          ))}
        </Card>
      ) : (
        <Card className="p-4">
          <p className="text-sm text-text-muted text-pretty">لا نقاط بعد — صلاتك وأذكارك ووِردك تُكتب هنا حين تسجّلها.</p>
        </Card>
      )}
    </section>
  );
}

/** «المشاركة في الترتيب» and «إخفاء اسمي» — mirrored in Settings › الحساب. */
function Privacy() {
  const join = useSettingsStore((s) => s.leaderboardJoin);
  const setJoin = useSettingsStore((s) => s.setLeaderboardJoin);
  const hide = useSettingsStore((s) => s.leaderboardHideName);
  const setHide = useSettingsStore((s) => s.setLeaderboardHideName);
  const userName = useSettingsStore((s) => s.userName);
  if (!isSupabaseConfigured) return null;
  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle title="الخصوصية" subtitle="يُرفع مجموع نقاطك فقط، لا تفاصيل عبادتك" />
      <Card className="p-1.5 divide-y divide-black/[0.05] dark:divide-white/[0.06]">
        <div className="flex items-center gap-3 px-3 py-3">
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-text-primary dark:text-text-on-dark">المشاركة في الترتيب</span>
            <span className="block text-[11px] text-text-muted text-pretty">إيقافها يحذف نقاطك من الترتيب</span>
          </span>
          <Toggle checked={join} onChange={setJoin} size="sm" label="المشاركة في الترتيب" hideLabel />
        </div>
        <div className="flex items-center gap-3 px-3 py-3">
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-text-primary dark:text-text-on-dark">إخفاء اسمي</span>
            <span className="block text-[11px] text-text-muted text-pretty">
              {hide ? 'يراك الآخرون باسم «مجهول» ورقم ثابت' : `يظهر باسم «${userName.trim() || 'مجهول'}» — غيّره من الإعدادات`}
            </span>
          </span>
          <Toggle checked={hide} onChange={setHide} size="sm" label="إخفاء اسمي في الترتيب" hideLabel disabled={!join} />
        </div>
      </Card>
    </section>
  );
}
