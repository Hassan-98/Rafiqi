import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { BarChart3, ChevronLeft, Pin, Sprout, TrendingUp } from 'lucide-react';
import { TopAppBar } from '@/components/layout/TopAppBar';
import { Card } from '@/components/ui/Card';
import { ArchMotif, SectionTitle } from '@/components/ui/Ornament';
import { HapticPressable } from '@/components/ui/HapticPressable';
import { BadgeEmblem } from '@/components/badges/BadgeEmblem';
import { BadgeSheet } from '@/components/badges/BadgeSheet';
import { TodayChallenges } from '@/components/badges/TodayChallenges';
import { CATEGORY_ICON, LevelSeal, ProgressBar, RARITY_BAR, RarityPill, badgeDate, leftFor } from '@/components/badges/badgeUi';
import {
  BADGE_CATEGORIES,
  CATEGORY_BY_ID,
  METRICS,
  RARITY_LABEL_AR,
  RARITY_ORDER,
  RARITY_POINTS,
  type BadgeCategory,
  type BadgeMetric,
} from '@/data/badges';
import { useBadgeStore } from '@/store/badgeStore';
import { useBadgeModel, type BadgeItem, type BadgeModel, type TrackItem } from '@/services/BadgeEngine';
import { doorStandings, type DoorStanding } from '@/services/badgeMetrics';
import { arCount } from '@/services/insightsEngine';
import { toArabicDigits } from '@/utils/arabicFormat';

type StatusFilter = 'all' | 'unlocked' | 'locked';
type Tab = 'summary' | 'all';

const shortDate = new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'long' });
const badgesCount = (n: number) => arCount(n, 'وسام واحد', 'وسامان', 'أوسمة', 'وساماً');
const ar = toArabicDigits;

/**
 * «خزانة الأوسمة» — the level up top, then two tabs:
 * «ملخّصك» (what you've won, what comes next, today's combined days, and where
 * you're strong / which doors wait — doorStandings) and «كل الأوسمة» (every
 * track by its door, the secrets last). `?cat=` opens the catalogue on a door.
 */
export function BadgeGalleryPage() {
  const navigate = useNavigate();
  const model = useBadgeModel();
  const featured = useBadgeStore((s) => s.featured);
  const markSeen = useBadgeStore((s) => s.markSeen);
  // Unlocks after the previous visit get a «جديد» mark during this one.
  const [seenBefore] = useState(() => useBadgeStore.getState().seenAt);
  useEffect(() => {
    markSeen();
    return markSeen;
  }, [markSeen]);

  const [params, setParams] = useSearchParams();
  const catParam = params.get('cat') as BadgeCategory | null;
  const cat: BadgeCategory | 'all' = catParam && CATEGORY_BY_ID[catParam] ? catParam : 'all';
  const tab: Tab = params.get('tab') === 'all' || cat !== 'all' ? 'all' : 'summary';
  const setView = (t: Tab, c: BadgeCategory | 'all' = 'all') =>
    setParams(
      () => {
        const n = new URLSearchParams();
        if (t === 'all') n.set('tab', 'all');
        if (t === 'all' && c !== 'all') n.set('cat', c);
        return n;
      },
      { replace: true },
    );
  const setCat = (c: BadgeCategory | 'all') => setView('all', c);
  const [status, setStatus] = useState<StatusFilter>('all');
  const [open, setOpen] = useState<{ metric: BadgeMetric; id?: string } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const isNew = (it: BadgeItem) => !!it.unlockedAt && (!seenBefore || it.unlockedAt > seenBefore);
  const openItem = (it: BadgeItem) => setOpen({ metric: it.badge.metric, id: it.badge.id });
  const standing = useMemo(() => doorStandings(model), [model]);
  const toDoor = (c: BadgeCategory) => {
    setView('all', c);
    window.scrollTo({ top: 0 });
  };

  const groups = useMemo(() => {
    const pass = (t: TrackItem) =>
      !t.secret && (cat === 'all' || t.category === cat) && (status === 'all' || (status === 'unlocked' ? t.got > 0 : !!t.next));
    return BADGE_CATEGORIES.map((c) => ({ cat: c, tracks: model.tracks.filter((t) => t.category === c.id && pass(t)) })).filter(
      (g) => g.tracks.length > 0,
    );
  }, [model.tracks, cat, status]);

  const secrets = model.tracks.filter((t) => t.tiers.every((x) => x.badge.hidden));
  const secretsFound = secrets.filter((t) => !t.secret).length;
  const featuredItems = featured.map((id) => model.byId.get(id)).filter((x): x is BadgeItem => !!x?.unlocked);
  const openTrack = open ? model.tracks.find((t) => t.metric === open.metric) ?? null : null;
  const lvl = model.level;
  const coverage = model.total ? Math.round((model.got / model.total) * 100) : 0;

  return (
    <div className="min-h-dvh bg-cream dark:bg-dark-bg" dir="rtl">
      <TopAppBar
        title="خزانة الأوسمة"
        showBack
        actions={
          <button
            type="button"
            onClick={() => navigate('/stats/achievements')}
            aria-label="سجل الإنجازات"
            className="w-11 h-11 rounded-xl inline-flex items-center justify-center text-teal dark:text-teal-light hover:bg-teal/10"
          >
            <BarChart3 size={20} />
          </button>
        }
      />
      <div className="flex flex-col gap-6 px-4 pt-4 pb-28 max-w-3xl mx-auto">
        {/* ── Hero: level, points, rarity ladder ─────────────────────── */}
        <Card variant="night" className="p-5">
          <ArchMotif className="absolute -top-3 -start-5 w-32 h-40 text-gold opacity-[0.14]" />
          <div className="relative flex items-center gap-4">
            <LevelSeal rank={lvl.level.rank} size={96} onDark />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-gold-light/85">المستوى {toArabicDigits(lvl.level.rank)}</p>
              <h1 className="font-display text-[26px] font-bold leading-tight text-text-on-dark text-balance">«{lvl.level.titleAr}»</h1>
              <p className="mt-1 text-xs text-text-on-dark/75">
                {model.got > 0 ? `${badgesCount(model.got)} من ${toArabicDigits(model.total)}` : 'أول وسام ينتظرك'}
              </p>
            </div>
          </div>
          <div className="relative mt-4 flex items-baseline justify-between gap-2 text-[11.5px]">
            <span className="font-counter tabular-nums font-bold text-gold-light">{toArabicDigits(model.points)} نقطة</span>
            <span className="text-text-on-dark/70">
              {lvl.next
                ? `بقي ${toArabicDigits(lvl.next.min - model.points)} إلى «${lvl.next.titleAr}»`
                : 'أعلى المستويات، بارك الله فيك'}
            </span>
          </div>
          <div
            className="relative mt-1.5 h-2 rounded-full bg-white/10 overflow-hidden"
            role="progressbar"
            aria-label="التقدّم إلى المستوى التالي"
            aria-valuenow={lvl.pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full rounded-full bg-[image:var(--gradient-gold)]" style={{ width: `${lvl.pct}%` }} />
          </div>
          <div className="relative mt-4 grid grid-cols-3 gap-2">
            {[
              { v: `${toArabicDigits(coverage)}٪`, l: 'نسبة الإنجاز' },
              { v: toArabicDigits(model.thisMonth), l: 'هذا الشهر' },
              { v: toArabicDigits(model.tracks.filter((t) => !t.next).length), l: 'مسارات مكتملة' },
            ].map((x) => (
              <div key={x.l} className="rounded-[var(--radius-inner)] bg-white/[0.06] ring-1 ring-white/[0.06] px-2 py-2.5 text-center">
                <p className="font-counter tabular-nums text-lg font-bold leading-none text-text-on-dark">{x.v}</p>
                <p className="mt-1 text-[10.5px] leading-none text-text-on-dark/65">{x.l}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* ── Two views: the summary, and the whole catalogue ───────── */}
        <div className="flex rounded-2xl bg-cream-dark/60 dark:bg-dark-surface p-1" role="tablist" aria-label="عرض الأوسمة">
          {(
            [
              ['summary', 'ملخّصك'],
              ['all', `كل الأوسمة (${ar(model.total)})`],
            ] as [Tab, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setView(k)}
              className={[
                'flex-1 min-h-11 rounded-xl text-sm font-bold transition-colors duration-200',
                tab === k
                  ? 'bg-white dark:bg-dark-card shadow-[var(--shadow-xs)] text-teal dark:text-teal-light'
                  : 'text-text-secondary dark:text-text-on-dark/70',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'summary' ? (
          <>
            <Achievements model={model} featured={featuredItems} isNew={isNew} onOpen={openItem} />
            <Upcoming
              items={model.nearest.length ? model.nearest.slice(0, 4) : standing.weak.flatMap((d) => (d.step ? [d.step] : []))}
              first={model.nearest.length === 0}
              onOpen={openItem}
            />
            <section className="flex flex-col gap-3">
              <SectionTitle title="تحدّيات اليوم" subtitle="أيامٌ جامعة، كل يوم تُكمله يقرّبك من وسامه" />
              <TodayChallenges />
            </section>
            <Standing strong={standing.strong} weak={standing.weak} doors={standing.doors} onOpen={openItem} onDoor={toDoor} />
          </>
        ) : null}

        {tab === 'all' ? (
          <>
            {/* ── The doors (categories) ────────────────────────────────── */}
            <section className="flex flex-col gap-3">
              <SectionTitle title="أبواب الأوسمة" subtitle="اختر باباً لترى مساراته" />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {model.categories.map((c) => {
                  const Icon = CATEGORY_ICON[c.id];
                  const active = cat === c.id;
                  const pct = c.total ? Math.round((c.got / c.total) * 100) : 0;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => {
                        setCat(active ? 'all' : c.id);
                        requestAnimationFrame(() => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
                      }}
                      className={[
                        'rounded-[var(--radius-inner)] p-3 text-start flex items-center gap-2.5 ring-1 transition-colors',
                        active
                          ? 'bg-teal/10 ring-teal/40 dark:bg-teal/15'
                          : 'bg-white dark:bg-dark-card ring-black/[0.04] dark:ring-white/[0.06] hover:ring-teal/25',
                      ].join(' ')}
                    >
                      <span
                        className={[
                          'w-9 h-9 rounded-xl inline-flex items-center justify-center shrink-0',
                          pct === 100 ? 'bg-gold/15 text-gold-dark dark:text-gold-light' : 'bg-teal/10 text-teal dark:text-teal-light',
                        ].join(' ')}
                      >
                        <Icon size={17} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12.5px] font-bold leading-tight text-text-primary dark:text-text-on-dark truncate">{c.label}</span>
                        <span className="mt-1 flex items-center gap-1.5">
                          <span className="flex-1 h-1 rounded-full bg-cream-dark/70 dark:bg-dark-surface overflow-hidden">
                            <span className="block h-full rounded-full bg-teal dark:bg-teal-light" style={{ width: `${pct}%` }} />
                          </span>
                          <span className="font-counter tabular-nums text-[10.5px] text-text-muted">
                            {toArabicDigits(c.got)}/{toArabicDigits(c.total)}
                          </span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* ── Tracks ────────────────────────────────────────────────── */}
            <section ref={listRef} className="flex flex-col gap-3 scroll-mt-20">
              <SectionTitle
                title={cat === 'all' ? 'كل المسارات' : CATEGORY_BY_ID[cat].label}
                subtitle={cat === 'all' ? 'كل مسار درجات من السهل إلى الأصعب' : CATEGORY_BY_ID[cat].hint}
                action={
                  cat !== 'all' ? (
                    <button
                      type="button"
                      onClick={() => setCat('all')}
                      className="inline-flex items-center gap-0.5 min-h-9 px-1 text-xs font-semibold text-teal dark:text-teal-light"
                    >
                      كل الأبواب <ChevronLeft size={14} />
                    </button>
                  ) : undefined
                }
              />
              <div className="flex rounded-2xl bg-cream-dark/60 dark:bg-dark-surface p-1" role="tablist" aria-label="حالة الأوسمة">
                {(
                  [
                    ['all', 'الكل'],
                    ['unlocked', 'المُحرَزة'],
                    ['locked', 'القادمة'],
                  ] as [StatusFilter, string][]
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={status === k}
                    onClick={() => setStatus(k)}
                    className={[
                      'flex-1 min-h-10 rounded-xl text-sm font-bold transition-colors duration-200',
                      status === k
                        ? 'bg-white dark:bg-dark-card shadow-[var(--shadow-xs)] text-teal dark:text-teal-light'
                        : 'text-text-secondary dark:text-text-on-dark/70',
                    ].join(' ')}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {groups.length === 0 ? (
                <Card variant="inset" className="p-6">
                  <p className="text-sm text-text-secondary dark:text-text-on-dark/80 text-center">لا مسارات في هذا التصنيف بعد</p>
                </Card>
              ) : (
                groups.map((g) => {
                  const Icon = CATEGORY_ICON[g.cat.id];
                  const stat = model.categories.find((c) => c.id === g.cat.id);
                  return (
                    <div key={g.cat.id} className="flex flex-col gap-2">
                      {cat === 'all' ? (
                        <div className="flex items-center gap-2 px-1 pt-1">
                          <Icon size={15} className="text-gold-dark dark:text-gold-light" />
                          <h3 className="text-[13px] font-bold text-text-primary dark:text-text-on-dark">{g.cat.label}</h3>
                          {stat ? (
                            <span className="font-counter tabular-nums text-[11px] text-text-muted">
                              {toArabicDigits(stat.got)}/{toArabicDigits(stat.total)}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      <Card className="p-1.5">
                        {g.tracks.map((t, i) => (
                          <div key={t.metric}>
                            {i > 0 ? <div className="mx-3 h-px bg-black/[0.05] dark:bg-white/[0.06]" /> : null}
                            <TrackRow track={t} isNew={t.tiers.some(isNew)} onOpen={() => setOpen({ metric: t.metric })} />
                          </div>
                        ))}
                      </Card>
                    </div>
                  );
                })
              )}
            </section>

            {/* ── Secrets ───────────────────────────────────────────────── */}
            {secrets.length > 0 ? (
              <section className="flex flex-col gap-3">
                <SectionTitle
                  title="أوسمة خفية"
                  subtitle={`اكتشفتَ ${toArabicDigits(secretsFound)} من ${toArabicDigits(secrets.length)} — تظهر حين تنالها`}
                />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {secrets.map((t) => {
                    const found = !t.secret;
                    const it = t.top ?? t.tiers[0];
                    return (
                      <button
                        key={t.metric}
                        type="button"
                        onClick={() => setOpen({ metric: t.metric })}
                        className={[
                          'rounded-[var(--radius-card)] p-3.5 flex flex-col items-center gap-1.5 text-center ring-1',
                          found
                            ? 'bg-[image:var(--gradient-hero-light)] dark:bg-[image:var(--gradient-hero-dark)] ring-gold/30'
                            : 'bg-cream-dark/40 dark:bg-dark-surface ring-transparent border border-dashed border-text-muted/30',
                        ].join(' ')}
                      >
                        <BadgeEmblem icon={it.badge.icon} rarity={it.badge.rarity} unlocked={found} mystery={!found} size={58} />
                        <span className="text-[12.5px] font-bold text-text-primary dark:text-text-on-dark leading-tight">
                          {found ? it.badge.titleAr : 'وسام خفي'}
                        </span>
                        <span className="text-[11px] leading-snug text-text-muted line-clamp-2 text-pretty">
                          {found ? `${toArabicDigits(t.got)}/${toArabicDigits(t.tiers.length)} درجات` : it.badge.hint}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <p className="px-2 text-center text-[11px] leading-relaxed text-text-muted">
              النقاط حسب الندرة:{' '}
              {RARITY_ORDER.map((r) => `${RARITY_LABEL_AR[r]} ${toArabicDigits(RARITY_POINTS[r])}`).join('، ')}
              {featuredItems.length === 0 && model.got > 0 ? (
                <span className="mt-1.5 flex items-center justify-center gap-1">
                  <Pin size={12} /> افتح أي وسام أحرزته واعرضه في ملفك
                </span>
              ) : null}
            </p>
          </>
        ) : null}
      </div>

      <BadgeSheet track={openTrack} initialId={open?.id} onClose={() => setOpen(null)} />
    </div>
  );
}

function TrackRow({ track: t, isNew, onOpen }: { track: TrackItem; isNew: boolean; onOpen: () => void }) {
  const shown = t.top ?? t.next ?? t.tiers[0];
  const next = t.next;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full flex items-center gap-3 px-3 py-3 rounded-[var(--radius-inner)] text-start hover:bg-teal/5 transition-colors"
    >
      <BadgeEmblem
        icon={shown.badge.icon}
        rarity={shown.badge.rarity}
        unlocked={shown.unlocked}
        pct={shown.unlocked ? 0 : shown.pct}
        size={54}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 min-w-0">
            <span className="text-sm font-bold text-text-primary dark:text-text-on-dark truncate">{t.label}</span>
            {isNew ? (
              <span className="shrink-0 px-1.5 py-px rounded-md bg-gold/20 text-gold-dark dark:text-gold-light text-[9.5px] font-bold">جديد</span>
            ) : null}
          </span>
          <span className="shrink-0 flex items-center gap-[3px]" aria-label={`${toArabicDigits(t.got)} من ${toArabicDigits(t.tiers.length)} درجات`}>
            {t.tiers.map((x) => (
              <span
                key={x.badge.id}
                className={['w-2 h-2 rounded-full', x.unlocked ? RARITY_BAR[x.badge.rarity] : 'bg-text-muted/25'].join(' ')}
              />
            ))}
          </span>
        </span>
        <span className="block mt-0.5 text-[11.5px] text-text-muted truncate">
          {next
            ? `${t.top ? `«${t.top.badge.titleAr}»، ` : ''}التالي: «${next.badge.titleAr}»`
            : `اكتمل المسار، «${t.top?.badge.titleAr}»${t.top?.unlockedAt ? ` في ${badgeDate.format(new Date(t.top.unlockedAt))}` : ''}`}
        </span>
        {next ? (
          <span className="mt-1.5 flex items-center gap-2">
            <ProgressBar pct={next.pct} rarity={next.badge.rarity} className="flex-1" />
            <span className="shrink-0 font-counter tabular-nums text-[10.5px] text-text-muted">
              {toArabicDigits(Math.min(next.current, next.target))}/{toArabicDigits(next.target)}
            </span>
          </span>
        ) : null}
      </span>
    </button>
  );
}

/** «إنجازاتك»: the latest unlock up front, the ones before it, the rarity ladder, the pinned. */
function Achievements({
  model,
  featured,
  isNew,
  onOpen,
}: {
  model: BadgeModel;
  featured: BadgeItem[];
  isNew: (it: BadgeItem) => boolean;
  onOpen: (it: BadgeItem) => void;
}) {
  const [latest, ...earlier] = model.recent;
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle
        title="إنجازاتك"
        subtitle={
          model.got > 0
            ? `${badgesCount(model.got)} من ${ar(model.total)}${model.thisMonth ? `، منها ${ar(model.thisMonth)} هذا الشهر` : ''}`
            : 'أول وسام ينتظرك — تجده في «القادم»'
        }
      />
      {latest ? (
        <HapticPressable
          onClick={() => onOpen(latest)}
          className="relative w-full rounded-[var(--radius-card)] bg-[image:var(--gradient-hero-light)] dark:bg-[image:var(--gradient-hero-dark)] ring-1 ring-gold/30 shadow-[var(--shadow-sm)] p-4 flex items-center gap-4 text-start"
        >
          <BadgeEmblem icon={latest.badge.icon} rarity={latest.badge.rarity} unlocked size={80} animate />
          <span className="min-w-0 flex-1 flex flex-col gap-1">
            <span className="flex items-center gap-1.5 text-[11px] text-text-muted">
              آخر ما أحرزت
              {isNew(latest) ? (
                <span className="px-1.5 py-px rounded-md bg-gold/20 text-gold-dark dark:text-gold-light text-[9.5px] font-bold">جديد</span>
              ) : null}
            </span>
            <span className="font-display text-[18px] font-bold leading-tight text-text-primary dark:text-text-on-dark text-balance">
              {latest.badge.titleAr}
            </span>
            <span className="text-[12px] leading-snug text-text-secondary dark:text-text-on-dark/75 line-clamp-2 text-pretty">
              {latest.badge.descriptionAr}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <RarityPill rarity={latest.badge.rarity} points />
              {latest.unlockedAt ? <span className="text-[10.5px] text-text-muted">{shortDate.format(new Date(latest.unlockedAt))}</span> : null}
            </span>
          </span>
        </HapticPressable>
      ) : null}

      {earlier.length > 0 ? (
        <div className="-mx-4 px-4 flex gap-2.5 overflow-x-auto no-scrollbar snap-x" aria-label="أُحرزت قبلها">
          {earlier.map((it) => (
            <button
              key={it.badge.id}
              type="button"
              onClick={() => onOpen(it)}
              className="relative snap-start shrink-0 w-[118px] rounded-[var(--radius-card)] bg-white dark:bg-dark-card shadow-[var(--shadow-sm)] ring-1 ring-black/[0.04] dark:ring-white/[0.06] border-t-2 border-t-gold p-3 flex flex-col items-center gap-1.5 text-center"
            >
              {isNew(it) ? (
                <span className="absolute top-2 start-2 px-1.5 py-px rounded-md bg-gold/20 text-gold-dark dark:text-gold-light text-[9.5px] font-bold">
                  جديد
                </span>
              ) : null}
              <BadgeEmblem icon={it.badge.icon} rarity={it.badge.rarity} unlocked size={52} />
              <span className="text-xs font-bold leading-tight text-text-primary dark:text-text-on-dark line-clamp-2">{it.badge.titleAr}</span>
              {it.unlockedAt ? <span className="text-[10px] text-text-muted">{shortDate.format(new Date(it.unlockedAt))}</span> : null}
            </button>
          ))}
        </div>
      ) : null}

      <Card className="px-2 py-3">
        <div className="grid grid-cols-5 gap-1" aria-label="أوسمتك حسب الندرة">
          {RARITY_ORDER.map((r) => (
            <div key={r} className="flex flex-col items-center gap-1 text-center">
              <BadgeEmblem icon="" rarity={r} unlocked={model.rarity[r].got > 0} size={34} />
              <span className="font-counter tabular-nums text-[12px] font-bold text-text-primary dark:text-text-on-dark leading-none">
                {ar(model.rarity[r].got)}
                <span className="text-text-muted">/{ar(model.rarity[r].total)}</span>
              </span>
              <span className="text-[10px] text-text-muted leading-none">{RARITY_LABEL_AR[r]}</span>
            </div>
          ))}
        </div>
      </Card>

      {featured.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="px-1 text-[12px] font-bold text-text-secondary dark:text-text-on-dark/80">
            أوسمتي المختارة <span className="font-normal text-text-muted">— تظهر في صفحة «أنا»</span>
          </p>
          <div className="grid grid-cols-3 gap-2.5">
            {featured.map((it) => (
              <button
                key={it.badge.id}
                type="button"
                onClick={() => onOpen(it)}
                className="rounded-[var(--radius-card)] bg-white dark:bg-dark-card ring-1 ring-gold/30 p-3 flex flex-col items-center gap-1.5 text-center"
              >
                <BadgeEmblem icon={it.badge.icon} rarity={it.badge.rarity} unlocked size={52} />
                <span className="text-[12px] font-bold leading-tight text-text-primary dark:text-text-on-dark line-clamp-2">{it.badge.titleAr}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

/** «القادم»: the next tiers closest to unlocking, each with what is left. */
function Upcoming({ items, first, onOpen }: { items: BadgeItem[]; first: boolean; onOpen: (it: BadgeItem) => void }) {
  if (!items.length) return null;
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle title="القادم" subtitle={first ? 'أوسمة قريبة لتبدأ بها' : 'أقرب الأوسمة إليك، وما بقي لكل منها'} />
      <Card className="p-1.5">
        {items.map((it, i) => (
          <div key={it.badge.id}>
            {i > 0 ? <div className="mx-3 h-px bg-black/[0.05] dark:bg-white/[0.06]" /> : null}
            <button
              type="button"
              onClick={() => onOpen(it)}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-[var(--radius-inner)] text-start hover:bg-teal/5 transition-colors"
            >
              <BadgeEmblem icon={it.badge.icon} rarity={it.badge.rarity} unlocked={false} pct={it.pct} size={54} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-bold text-text-primary dark:text-text-on-dark truncate">{it.badge.titleAr}</span>
                  <span className="shrink-0 text-[12px] font-bold text-teal dark:text-teal-light">{leftFor(it)}</span>
                </span>
                <span className="block mt-0.5 text-[11px] text-text-muted truncate">
                  {CATEGORY_BY_ID[METRICS[it.badge.metric].cat].label}، {RARITY_LABEL_AR[it.badge.rarity]}
                </span>
                <span className="mt-1.5 flex items-center gap-2">
                  <ProgressBar pct={it.pct} rarity={it.badge.rarity} className="flex-1" />
                  <span className="shrink-0 font-counter tabular-nums text-[10.5px] text-text-muted">
                    {ar(Math.min(it.current, it.target))}/{ar(it.target)}
                  </span>
                </span>
              </span>
            </button>
          </div>
        ))}
      </Card>
    </section>
  );
}

function DoorRow({ d, tone, onClick }: { d: DoorStanding; tone: 'gold' | 'teal' | 'plain'; onClick: () => void }) {
  const Icon = CATEGORY_ICON[d.id];
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-inner)] text-start hover:bg-teal/5 transition-colors"
    >
      <span
        className={[
          'w-9 h-9 rounded-xl inline-flex items-center justify-center shrink-0',
          tone === 'gold' ? 'bg-gold/15 text-gold-dark dark:text-gold-light' : 'bg-teal/10 text-teal dark:text-teal-light',
        ].join(' ')}
      >
        <Icon size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-bold text-text-primary dark:text-text-on-dark truncate">{d.label}</span>
          <span className="shrink-0 font-counter tabular-nums text-[11px] text-text-muted">
            {ar(d.got)} من {ar(d.total)}
          </span>
        </span>
        <span className="mt-1.5 flex items-center gap-2">
          <span className="flex-1 h-1.5 rounded-full bg-cream-dark/70 dark:bg-white/10 overflow-hidden">
            <span
              className={['block h-full rounded-full', tone === 'gold' ? 'bg-[image:var(--gradient-gold)]' : 'bg-teal dark:bg-teal-light'].join(' ')}
              style={{ width: `${Math.max(d.activity * 100, d.activity > 0 ? 4 : 0)}%` }}
            />
          </span>
          <span
            className={[
              'shrink-0 w-9 text-end font-counter tabular-nums text-[11px] font-bold',
              tone === 'gold' ? 'text-gold-dark dark:text-gold-light' : 'text-text-muted',
            ].join(' ')}
          >
            {ar(Math.round(d.activity * 100))}٪
          </span>
        </span>
      </span>
    </button>
  );
}

/** «قوتك وضعفك»: the strongest doors, the ones that wait (each with its nearest step), and all doors ranked. */
function Standing({
  strong,
  weak,
  doors,
  onOpen,
  onDoor,
}: {
  strong: DoorStanding[];
  weak: DoorStanding[];
  doors: DoorStanding[];
  onOpen: (it: BadgeItem) => void;
  onDoor: (c: BadgeCategory) => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle title="قوتك وما يحتاج عنايتك" subtitle="بحسب نشاطك في كل باب خلال الأسابيع الأربعة الأخيرة" />
      {strong.length > 0 ? (
        <Card className="p-1.5">
          <p className="px-3 pt-2 pb-1 flex items-center gap-1.5 text-[12.5px] font-bold text-gold-dark dark:text-gold-light">
            <TrendingUp size={15} aria-hidden /> أقوى أبوابك
          </p>
          {strong.map((d) => (
            <DoorRow key={d.id} d={d} tone="gold" onClick={() => onDoor(d.id)} />
          ))}
        </Card>
      ) : null}
      {weak.length > 0 ? (
        <Card className="p-1.5">
          <p className="px-3 pt-2 pb-1 flex items-center gap-1.5 text-[12.5px] font-bold text-teal dark:text-teal-light">
            <Sprout size={15} aria-hidden /> {strong.length ? 'أبواب تنتظرك' : 'ابدأ من هنا'}
          </p>
          <p className="px-3 pb-1 text-[11.5px] text-text-muted text-pretty">خطوة قريبة في كل منها تفتح لك وساماً، وتُثقل ميزانك بإذن الله.</p>
          {weak.map((d, i) => (
            <div key={d.id}>
              {i > 0 ? <div className="mx-3 h-px bg-black/[0.05] dark:bg-white/[0.06]" /> : null}
              <DoorRow d={d} tone="teal" onClick={() => onDoor(d.id)} />
              {d.step ? (
                <button
                  type="button"
                  onClick={() => onOpen(d.step!)}
                  className="mx-3 mb-2 w-[calc(100%-1.5rem)] min-h-11 rounded-[var(--radius-inner)] bg-teal/[0.06] dark:bg-teal/10 px-3 py-2 flex items-center gap-2.5 text-start hover:bg-teal/10 transition-colors"
                >
                  <BadgeEmblem icon={d.step.badge.icon} rarity={d.step.badge.rarity} unlocked={false} pct={d.step.pct} size={34} />
                  <span className="min-w-0 flex-1 text-[12px] leading-snug text-text-secondary dark:text-text-on-dark/85">
                    أقرب خطوة: <span className="font-bold text-text-primary dark:text-text-on-dark">«{d.step.badge.titleAr}»</span>
                    <span className="text-text-muted"> — {leftFor(d.step)}</span>
                  </span>
                  <ChevronLeft size={15} className="shrink-0 text-text-muted" />
                </button>
              ) : null}
            </div>
          ))}
        </Card>
      ) : null}
      <details className="group rounded-[var(--radius-card)] bg-white dark:bg-dark-card shadow-[var(--shadow-sm)] ring-1 ring-black/[0.04] dark:ring-white/[0.06] p-1.5">
        <summary className="cursor-pointer list-none flex items-center justify-between min-h-11 px-3 text-[13px] font-bold text-text-primary dark:text-text-on-dark">
          ترتيب كل الأبواب
          <span className="text-xs font-semibold text-teal dark:text-teal-light group-open:hidden">عرض ({ar(doors.length)})</span>
        </summary>
        {doors.map((d) => (
          <DoorRow key={d.id} d={d} tone={strong.includes(d) ? 'gold' : 'plain'} onClick={() => onDoor(d.id)} />
        ))}
      </details>
    </section>
  );
}
