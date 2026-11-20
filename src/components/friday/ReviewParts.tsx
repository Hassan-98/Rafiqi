import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import {
  BookOpen, Check, ChevronLeft, Clock3, HandCoins, HeartHandshake, History, Layers, ListChecks, Lock, Minus, MoonStar, Sparkles, Sun, Sunrise,
  Target, TrendingDown, TrendingUp, Trophy, UtensilsCrossed, type LucideIcon,
} from 'lucide-react';
import { Mosque } from '@/components/icons/Mosque';
import { Card } from '@/components/ui/Card';
import { Medallion, SectionTitle } from '@/components/ui/Ornament';
import { Toggle } from '@/components/ui/Toggle';
import { BarChart } from '@/components/stats/BarChart';
import { Pill } from '@/components/study/studyUi';
import { toArabicDigits } from '@/utils/arabicFormat';
import { arCount } from '@/services/insightsEngine';
import { KAHF_PAGES } from '@/services/dayAttention';
import { FRIDAY_SUNAN } from '@/services/fridayReviewContent';
import { noon, weekById, weekLabel, type DomainId, type Pickable, type Trend, type Week } from '@/services/fridayReview';
import { useFridayReviewStore, type ReviewEntry } from '@/store/fridayReviewStore';
import { sessionStats, useMushafiStore } from '@/store/mushafiStore';

const ICON: Record<DomainId | 'points' | 'silat' | 'programs' | 'qada', LucideIcon | typeof Mosque> = {
  fard: Clock3,
  jamaah: Mosque,
  rawatib: Layers,
  duha: Sun,
  adhkar: Sunrise,
  quran: BookOpen,
  qiyam: MoonStar,
  fasting: UtensilsCrossed,
  awrad: Target,
  tasks: ListChecks,
  sadaqah: HandCoins,
  points: Trophy,
  silat: HeartHandshake,
  programs: TrendingUp,
  qada: History,
};
export const iconFor = (id: string) => ICON[id as keyof typeof ICON] ?? Sparkles;

const signed = (v: number) => (v > 0 ? `+${toArabicDigits(v)}` : v < 0 ? `−${toArabicDigits(-v)}` : '');

export function TrendChip({ trend, diff }: { trend: Trend; diff?: number }) {
  const Icon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  return (
    <span
      className={[
        'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold font-counter tabular-nums min-w-10 justify-center',
        trend === 'up' ? 'bg-teal/10 text-teal dark:text-teal-light' : trend === 'down' ? 'bg-danger/10 text-danger' : 'bg-track text-text-muted',
      ].join(' ')}
    >
      <Icon size={12} aria-hidden />
      {diff ? signed(diff) : null}
      <span className="sr-only">{trend === 'up' ? 'أكثر' : trend === 'down' ? 'أقل' : 'ثابت'}</span>
    </span>
  );
}

export interface CompareItem {
  id: string;
  label: string;
  value: string;
  prev?: string;
  trend: Trend;
  diff?: number;
  phrase: string;
  muted?: boolean;
  to?: string;
}

/** «بين أسبوعين»: one row per door, this week against the same days of the last. */
export function DomainList({ items }: { items: CompareItem[] }) {
  const navigate = useNavigate();
  return (
    <Card className="p-1.5">
      <ul className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
        {items.map((it) => {
          const Icon = iconFor(it.id);
          const body = (
            <>
              <span
                className={[
                  'w-9 h-9 rounded-xl inline-flex items-center justify-center shrink-0',
                  it.muted ? 'bg-track text-text-muted' : 'bg-teal/10 text-teal dark:text-teal-light',
                ].join(' ')}
              >
                <Icon size={18} aria-hidden />
              </span>
              <span className="flex-1 min-w-0">
                <span className="flex items-center gap-2">
                  <span className="flex-1 min-w-0 truncate text-[14px] font-semibold text-text-primary dark:text-text-on-dark">{it.label}</span>
                  <span className="text-[13px] font-counter font-bold tabular-nums text-text-primary dark:text-text-on-dark whitespace-nowrap">{it.value}</span>
                  {!it.muted ? <TrendChip trend={it.trend} diff={it.diff} /> : null}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-text-muted">
                  <span className="truncate">{it.phrase}</span>
                  {it.prev && !it.muted ? <span className="shrink-0 font-counter">· الماضي {it.prev}</span> : null}
                </span>
              </span>
            </>
          );
          return (
            <li key={it.id}>
              {it.to ? (
                <button
                  type="button"
                  onClick={() => navigate(it.to!)}
                  className="w-full text-start flex items-center gap-3 rounded-[var(--radius-inner)] px-3 py-3 hover:bg-teal/5 transition-colors"
                >
                  {body}
                </button>
              ) : (
                <div className="flex items-center gap-3 px-3 py-3">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** «ما أحمد الله عليه» / «ما أستدركه» — the auto-detected strongest and weakest doors. */
export function BestWeak({ best, weak }: { best: Pickable | null; weak: Pickable | null }) {
  if (!best && !weak) return null;
  const pct = (p: Pickable) => `${toArabicDigits(Math.round(p.score * 100))}٪`;
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Card variant="gold-rim" className="p-4">
        <p className="text-[11px] text-text-muted">ما أحمد الله عليه</p>
        {best ? (
          <>
            <p className="mt-1 text-[15px] font-bold text-text-primary dark:text-text-on-dark text-balance">{best.label}</p>
            <p className="mt-1 text-[12px] text-gold-dark dark:text-gold-light font-counter">{pct(best)} — الحمد لله</p>
          </>
        ) : (
          <p className="mt-1 text-[13px] text-text-secondary dark:text-text-on-dark/75">سجّل أعمالك ليظهر هنا</p>
        )}
      </Card>
      <Card className="p-4">
        <p className="text-[11px] text-text-muted">ما أستدركه</p>
        {weak ? (
          <>
            <p className="mt-1 text-[15px] font-bold text-text-primary dark:text-text-on-dark text-balance">{weak.label}</p>
            <p className="mt-1 text-[12px] text-text-secondary dark:text-text-on-dark/75 font-counter">
              {pct(weak)}
              {weak.score < weak.prevScore ? ' — أقل من الماضي' : ''}
            </p>
          </>
        ) : (
          <p className="mt-1 text-[13px] text-text-secondary dark:text-text-on-dark/75">أبوابك تامّة هذا الأسبوع</p>
        )}
      </Card>
    </div>
  );
}

/** Friday only: the day's sunan, each with its source. سورة الكهف ticks itself when مصحفي logged all its pages, or its sessions read or heard all of it. */
export function FridaySunan({ friday, male }: { friday: string; male: boolean }) {
  const navigate = useNavigate();
  const ticked = useFridayReviewStore((s) => s.sunan[friday]);
  const toggle = useFridayReviewStore((s) => s.toggleSunnah);
  const pages = useMushafiStore((s) => s.days[friday]);
  const sessions = useMushafiStore((s) => s.sessions);
  const kahfRead =
    (!!pages && Array.from({ length: KAHF_PAGES[1] - KAHF_PAGES[0] + 1 }, (_, i) => KAHF_PAGES[0] + i).every((p) => pages.includes(p))) ||
    sessionStats(sessions).kahfFridays.has(friday);
  const list = FRIDAY_SUNAN.filter((s) => male || !s.menOnly);
  const doneCount = list.filter((s) => (s.id === 'kahf' && kahfRead) || ticked?.includes(s.id)).length;

  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle title="سنن يوم الجمعة" subtitle={`${toArabicDigits(doneCount)} من ${toArabicDigits(list.length)} — «خير يوم طلعت عليه الشمس يوم الجمعة» (مسلم)`} />
      <Card className="p-1.5">
        <ul className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
          {list.map((s) => {
            const auto = s.id === 'kahf' && kahfRead;
            const on = auto || !!ticked?.includes(s.id);
            return (
              <li key={s.id} className="flex items-start gap-3 px-3 py-3">
                <button
                  type="button"
                  aria-pressed={on}
                  aria-label={s.title}
                  disabled={auto}
                  onClick={() => toggle(friday, s.id)}
                  className={[
                    'mt-0.5 w-9 h-9 shrink-0 rounded-xl inline-flex items-center justify-center transition-colors duration-200',
                    on ? 'bg-[image:var(--gradient-teal)] text-on-accent' : 'bg-cream-dark/60 dark:bg-white/[0.06] text-text-muted hover:bg-teal/10',
                  ].join(' ')}
                >
                  <Check size={17} strokeWidth={2.6} aria-hidden className={on ? '' : 'opacity-40'} />
                </button>
                <div className="flex-1 min-w-0">
                  <p className="flex items-center gap-2 text-[14px] font-semibold text-text-primary dark:text-text-on-dark">
                    {s.title}
                    {auto ? <span className="text-[11px] font-normal text-teal dark:text-teal-light">قرأتها في مصحفي</span> : null}
                  </p>
                  <p className="mt-0.5 text-[12.5px] leading-relaxed text-text-secondary dark:text-text-on-dark/80 text-pretty">{s.text}</p>
                  <p className="mt-0.5 text-[11px] text-text-muted">{s.source}</p>
                </div>
                {s.to ? (
                  <button
                    type="button"
                    onClick={() => navigate(s.to!)}
                    aria-label={`افتح ${s.title}`}
                    className="mt-0.5 w-9 h-9 shrink-0 rounded-xl inline-flex items-center justify-center text-teal dark:text-teal-light hover:bg-teal/10"
                  >
                    <ChevronLeft size={18} aria-hidden />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}

const KEPT_AR: Record<NonNullable<ReviewEntry['kept']>, string> = { yes: 'وفّيت', partly: 'بعضه', no: 'لم أوفَّق' };

/** Streak, the 12-week score chart and the journal of past reviews. */
export function ReviewHistory({
  trend,
  streak,
  currentWeek,
}: {
  trend: { week: Week; score: number | null }[];
  streak: { current: number; longest: number; total: number };
  currentWeek: string;
}) {
  const reviews = useFridayReviewStore((s) => s.reviews);
  const journal = Object.values(reviews)
    .filter((r) => r.doneAt)
    .sort((a, b) => b.week.localeCompare(a.week));
  const weeksAr = (v: number) => arCount(v, 'أسبوع واحد', 'أسبوعان', 'أسابيع', 'أسبوعاً');

  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle title="سجلّ المحاسبة" subtitle="درجة كل أسبوع في آخر ١٢ أسبوعاً" />
      <Card className="p-4">
        <div className="flex items-center gap-3">
          <Medallion size={52} tone="gold" className="text-[17px] text-gold-dark dark:text-gold-light">
            {toArabicDigits(streak.current)}
          </Medallion>
          <div className="min-w-0">
            <p className="text-[14px] font-bold text-text-primary dark:text-text-on-dark">
              {streak.current ? `${weeksAr(streak.current)} متتالية` : 'ابدأ سلسلة محاسبتك'}
            </p>
            <p className="text-[12px] text-text-muted">
              أطول سلسلة {toArabicDigits(streak.longest)} · مجموع المحاسبات {toArabicDigits(streak.total)}
            </p>
          </div>
        </div>
        <div className="mt-4">
          <BarChart
            height={130}
            max={100}
            formatValue={(v) => (v ? toArabicDigits(v) : '')}
            data={trend.map((t) => {
              const d = noon(t.week.to);
              return {
                label: `${toArabicDigits(d.getDate())}/${toArabicDigits(d.getMonth() + 1)}`,
                value: t.score ?? 0,
                highlight: t.week.id === currentWeek,
              };
            })}
          />
        </div>
      </Card>

      {journal.length ? (
        <Card className="p-1.5">
          <ul className="divide-y divide-black/[0.04] dark:divide-white/[0.06]">
            {journal.map((r) => (
              <li key={r.week}>
                <details className="group rounded-[var(--radius-inner)] px-3 py-3 open:bg-teal/[0.03]">
                  <summary className="flex items-center gap-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                    <span className="flex-1 min-w-0">
                      <span className="block text-[14px] font-semibold text-text-primary dark:text-text-on-dark font-counter">{weekLabel(weekById(r.week))}</span>
                      <span className="block text-[12px] text-text-muted truncate">
                        {r.focus ? `عزمي: ${r.focus.text}` : 'بلا عزم مكتوب'}
                        {r.kept ? ` · العزم السابق: ${KEPT_AR[r.kept]}` : ''}
                      </span>
                    </span>
                    {r.score != null ? (
                      <span className="text-[14px] font-counter font-bold tabular-nums text-teal dark:text-teal-light">{toArabicDigits(r.score)}٪</span>
                    ) : null}
                    <ChevronLeft size={16} className="text-text-muted transition-transform duration-200 group-open:-rotate-90" aria-hidden />
                  </summary>
                  <div className="mt-2 flex flex-col gap-2 text-[13px] leading-relaxed text-text-secondary dark:text-text-on-dark/80">
                    <Note title="ما أحمد الله عليه" text={r.thanks} />
                    <Note title="ما أستغفر الله منه" text={r.istighfar} />
                    <Note title="عزمي للأسبوع القادم" text={r.resolve} />
                    {!r.thanks && !r.istighfar && !r.resolve ? <p className="text-text-muted">لم تُكتب ملاحظات هذا الأسبوع.</p> : null}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <p className="px-1 text-[13px] text-text-muted text-pretty">تظهر هنا محاسباتك بعد أول محاسبة تتمّها، بملاحظاتك وعزمك لكل أسبوع.</p>
      )}
    </section>
  );
}

function Note({ title, text }: { title: string; text?: string }) {
  if (!text?.trim()) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold text-text-muted">{title}</p>
      <p className="whitespace-pre-line text-pretty">{text}</p>
    </div>
  );
}

const DAYS: { v: number; l: string }[] = [
  { v: 4, l: 'الخميس' },
  { v: 5, l: 'الجمعة' },
  { v: 6, l: 'السبت' },
];

/** The optional weekly reminder (default: Friday, half an hour after Asr). */
export function ReminderCard() {
  const r = useFridayReviewStore((s) => s.reminder);
  const set = useFridayReviewStore((s) => s.setReminder);
  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle title="التذكير الأسبوعي" />
      <Card className="p-4 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-text-primary dark:text-text-on-dark">ذكّرني بالمحاسبة</p>
            <p className="text-[12px] text-text-muted">
              {r.on ? `كل ${DAYS.find((d) => d.v === r.day)?.l ?? 'جمعة'} ${r.at === 'asr' ? 'بعد العصر بنصف ساعة' : `الساعة ${toArabicDigits(r.at)}`}` : 'متوقف'}
            </p>
          </div>
          <Toggle checked={r.on} onChange={(on) => set({ on })} label="تذكير المحاسبة الأسبوعي" hideLabel />
        </div>
        {r.on ? (
          <>
            <Row label="اليوم">
              {DAYS.map((d) => (
                <Pill key={d.v} active={r.day === d.v} onClick={() => set({ day: d.v })}>
                  {d.l}
                </Pill>
              ))}
            </Row>
            <Row label="الوقت">
              <Pill active={r.at === 'asr'} onClick={() => set({ at: 'asr' })}>
                بعد العصر
              </Pill>
              <Pill active={r.at !== 'asr'} onClick={() => set({ at: r.at === 'asr' ? '20:00' : r.at })}>
                وقت محدد
              </Pill>
              {r.at !== 'asr' ? (
                <input
                  type="time"
                  value={r.at}
                  onChange={(e) => e.target.value && set({ at: e.target.value })}
                  aria-label="وقت التذكير"
                  className="min-h-9 rounded-xl bg-cream-dark/60 dark:bg-white/[0.06] px-2 text-[13px] font-counter text-text-primary dark:text-text-on-dark outline-none focus:ring-2 focus:ring-teal/40"
                />
              ) : null}
            </Row>
          </>
        ) : null}
      </Card>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="w-12 text-[12px] font-semibold text-text-secondary dark:text-text-on-dark/75">{label}</span>
      {children}
    </div>
  );
}

export function PrivacyNote() {
  return (
    <p className="flex items-start gap-2 px-1 text-[12px] text-text-muted text-pretty">
      <Lock size={14} className="mt-0.5 shrink-0" aria-hidden />
      محاسبتك لك وحدك: تُحفظ مع بياناتك الخاصة، ولا يراها أحد، ولا يُرفع منها إلى الترتيب إلا أنك أتممتها.
    </p>
  );
}
