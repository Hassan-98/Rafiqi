import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Plus, ChevronLeft, ChevronDown, Flame, Bell, Check, Layers, Hand, BookOpen, HandHeart, Target as TargetIcon, Clock } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ArchMotif, SectionTitle, Star8 } from '@/components/ui/Ornament';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { EmptyState } from '@/components/ui/EmptyState';
import { SectionInsights } from '@/components/stats/SectionInsights';
import { OfferCard } from '@/components/home/StreakRescueCard';
import { TargetFormModal } from '@/components/targets/TargetFormModal';
import { QuickReminderSheet } from '@/components/reminders/QuickReminderSheet';
import { useRescueOffers } from '@/services/streakRescue';
import {
  useTargetsStore,
  TARGET_UNIT_LABEL,
  QURAN_UNITS,
  carriedOf,
  type Target,
  type TargetRecurrence,
  type TargetUnit,
} from '@/store/targetsStore';
import { toArabicDigits } from '@/utils/arabicFormat';

export function remainingTimeAr(ms: number): string {
  if (ms <= 0) return 'انتهى';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${toArabicDigits(mins)} دقيقة`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${toArabicDigits(hours)} ساعة`;
  return `${toArabicDigits(Math.round(hours / 24))} يوم`;
}

const pctOf = (t: Target) => (t.total > 0 ? Math.min(100, Math.round((t.current / t.total) * 100)) : 0);
const isMet = (t: Target) => t.current >= t.total;

/** The unit's icon chip — a glance tells dhikr from Quran from du'a. */
export function unitIcon(unit: TargetUnit): LucideIcon {
  if (QURAN_UNITS.includes(unit)) return BookOpen;
  if (unit === 'duaa') return HandHeart;
  if (unit === 'dhikr') return Hand;
  return TargetIcon;
}

const GROUPS: { id: TargetRecurrence; title: string }[] = [
  { id: 'daily', title: 'الأوراد اليومية' },
  { id: 'weekly', title: 'الأوراد الأسبوعية' },
  { id: 'monthly', title: 'الأوراد الشهرية' },
  { id: 'none', title: 'أهداف لمرّة واحدة' },
];

/**
 * «الأوراد» segment of the عباداتي tab: today's summary with the next wird
 * to continue, any streak-rescue offers, then the awrad grouped by cadence
 * (unfinished first), the progress insights, and the finished one-offs.
 */
export function AwradPanel() {
  const navigate = useNavigate();
  const targets = useTargetsStore((s) => s.targets);
  const offers = useRescueOffers().filter((o) => o.key.startsWith('awrad:'));
  const [createOpen, setCreateOpen] = useState(false);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [showDone, setShowDone] = useState(false);

  const model = useMemo(() => {
    const active = targets.filter((t) => !t.completedAt);
    const order = (list: Target[]) => [
      // Unfinished first, nearest deadline first — "what to do next".
      ...list.filter((t) => !isMet(t)).sort((x, y) => x.deadline - y.deadline),
      ...list.filter(isMet),
    ];
    return {
      active,
      done: targets.filter((t) => t.completedAt).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)),
      pending: order(active).filter((t) => !isMet(t)),
      groups: GROUPS.map((g) => ({ ...g, items: order(active.filter((t) => (t.recurrence ?? 'none') === g.id)) })).filter(
        (g) => g.items.length > 0,
      ),
      bestStreak: active.reduce((m, t) => Math.max(m, t.streak ?? 0), 0),
      nafl: active.reduce((n, t) => n + (t.extra ?? 0), 0),
    };
  }, [targets]);

  const open = (t: Target) => navigate(`/targets/${t.id}`);

  if (targets.length === 0) {
    return (
      <>
        <Card className="p-2">
          <EmptyState
            title="ابدأ وِردك الأول"
            description="مثال: ١٠٠ استغفار كل يوم، أو صفحتان من القرآن يومياً، أو ختم سورة الكهف كل جمعة، مع تذكير لطيف."
            cta={{ label: 'أنشئ وِرداً', onClick: () => setCreateOpen(true) }}
          />
        </Card>
        <TargetFormModal open={createOpen} onClose={() => setCreateOpen(false)} />
      </>
    );
  }

  const { active, pending } = model;
  const focus = pending[0];
  const metCount = active.length - pending.length;
  const allMet = active.length > 0 && pending.length === 0;
  const heroPct = active.length ? Math.round((metCount / active.length) * 100) : 100;

  return (
    <div className="flex flex-col gap-6">
      {/* ── Today: how far, and the next wird to continue ─────── */}
      <Card variant="hero" className="p-5">
        <ArchMotif className="absolute -top-6 -end-8 w-40 opacity-15" />
        <div className="relative flex items-center gap-4">
          <div className="relative shrink-0">
            <ProgressRing
              value={heroPct}
              size={92}
              strokeWidth={7}
              showPercent={false}
              colorFrom="var(--color-gold-light)"
              colorTo="var(--color-gold)"
              trackColor="color-mix(in srgb, var(--color-on-accent) 16%, transparent)"
            />
            <span className="absolute inset-0 flex flex-col items-center justify-center">
              {allMet ? (
                <Star8 size={28} className="text-gold-light" />
              ) : (
                <>
                  <span className="font-counter font-bold text-[26px] leading-none tabular-nums">
                    {toArabicDigits(metCount)}
                    <span className="text-sm text-on-accent/70">/{toArabicDigits(active.length)}</span>
                  </span>
                  <span className="text-[10px] text-on-accent/75 mt-1">مكتملة</span>
                </>
              )}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-on-accent/70">أورادك الآن</p>
            <h2 className="mt-0.5 text-xl font-display font-bold text-balance leading-snug">
              {allMet ? 'أتممت أورادك، بارك الله فيك' : pending.length === 1 ? 'بقي وِرد واحد' : `بقي ${toArabicDigits(pending.length)} أوراد`}
            </h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {model.bestStreak > 0 ? (
                <HeroChip Icon={Flame} label={`أطول سلسلة ${toArabicDigits(model.bestStreak)}`} />
              ) : null}
              {model.nafl > 0 ? <HeroChip Icon={Star8Icon} label={`نافلة +${toArabicDigits(model.nafl)}`} /> : null}
            </div>
          </div>
        </div>

        {focus ? (
          <button
            type="button"
            onClick={() => open(focus)}
            className="relative mt-4 w-full rounded-[var(--radius-inner)] bg-on-accent text-text-primary p-3 flex items-center gap-3 text-start shadow-[var(--shadow-sm)] active:scale-[0.99] transition-transform"
          >
            <UnitChip unit={focus.unit} />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-bold truncate">{focus.title}</span>
                <span className="shrink-0 text-[11px] font-counter tabular-nums text-text-muted">
                  {toArabicDigits(focus.current)}/{toArabicDigits(focus.total)}
                </span>
              </span>
              <Bar pct={pctOf(focus)} met={false} className="mt-1.5" />
              <span className="mt-1 block text-[11px] text-text-muted">
                باقٍ {toArabicDigits(Math.max(0, focus.total - focus.current))} {TARGET_UNIT_LABEL[focus.unit]} · ينتهي بعد{' '}
                {remainingTimeAr(focus.deadline - Date.now())}
              </span>
            </span>
            <span className="shrink-0 inline-flex items-center gap-0.5 text-xs font-bold text-teal">
              تابع <ChevronLeft size={15} />
            </span>
          </button>
        ) : null}
      </Card>

      {/* ── A broken streak still inside its week ─────────────── */}
      {offers.length > 0 ? (
        <section className="flex flex-col gap-2.5">
          <SectionTitle title="استعد سلسلتك" subtitle="زِد اليوم ويعود الوِرد متصلاً" />
          {offers.map((o) => (
            <OfferCard key={o.key} offer={o} />
          ))}
        </section>
      ) : null}

      {/* ── The awrad, by cadence ─────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 -mb-3">
        <h2 className="text-[15px] font-display font-bold text-text-primary dark:text-text-on-dark">أورادي</h2>
        <div className="flex items-center gap-1">
          <Button variant="icon" aria-label="تذكير مخصّص للأوراد" onClick={() => setReminderOpen(true)}>
            <Bell size={17} />
          </Button>
          <Button size="sm" variant="soft" leftIcon={<Plus size={15} />} onClick={() => setCreateOpen(true)}>
            وِرد جديد
          </Button>
        </div>
      </div>

      {model.groups.map((g) => {
        const met = g.items.filter(isMet).length;
        return (
          <section key={g.id} className="flex flex-col gap-2.5">
            <SectionTitle
              title={g.title}
              action={
                <span className="font-counter tabular-nums text-xs text-text-muted">
                  {toArabicDigits(met)}/{toArabicDigits(g.items.length)} مكتملة
                </span>
              }
            />
            <Card className="p-1.5">
              {g.items.map((t, i) => (
                <WirdRow key={t.id} t={t} first={i === 0} onClick={() => open(t)} />
              ))}
            </Card>
          </section>
        );
      })}

      <section className="flex flex-col gap-2.5">
        <SectionTitle title="تقدّمك في الأوراد" />
        <SectionInsights domain="awrad" statsTo="/stats/awrad" />
      </section>

      {model.done.length > 0 ? (
        <section className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            aria-expanded={showDone}
            className="w-full min-h-11 flex items-center justify-between gap-2 text-start"
          >
            <span className="text-[15px] font-display font-bold text-text-primary dark:text-text-on-dark">
              أوراد أتممتها{' '}
              <span className="font-counter text-sm text-text-muted">({toArabicDigits(model.done.length)})</span>
            </span>
            <ChevronDown size={18} className={`text-text-muted transition-transform duration-200 ${showDone ? 'rotate-180' : ''}`} />
          </button>
          {showDone ? (
            <Card className="p-1.5">
              {model.done.map((t, i) => (
                <WirdRow key={t.id} t={t} first={i === 0} onClick={() => open(t)} />
              ))}
            </Card>
          ) : null}
        </section>
      ) : null}

      <TargetFormModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <QuickReminderSheet
        open={reminderOpen}
        onClose={() => setReminderOpen(false)}
        section="targets"
        defaultTitle="تذكير بأورادي"
      />
    </div>
  );
}

function Star8Icon({ size = 12 }: { size?: number }) {
  return <Star8 size={size} />;
}

function HeroChip({ Icon, label }: { Icon: LucideIcon | typeof Star8Icon; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-lg bg-on-accent/12 px-2 py-1 text-[11px] font-semibold text-on-accent/90">
      <Icon size={12} />
      <span className="font-counter tabular-nums">{label}</span>
    </span>
  );
}

export function UnitChip({ unit, met = false }: { unit: TargetUnit; met?: boolean }) {
  const Icon = unitIcon(unit);
  return (
    <span
      className={[
        'w-10 h-10 rounded-xl inline-flex items-center justify-center shrink-0',
        met ? 'bg-gold/15 text-gold-dark dark:text-gold-light' : 'bg-teal/10 text-teal dark:text-teal-light',
      ].join(' ')}
    >
      {met ? <Check size={18} strokeWidth={2.8} /> : <Icon size={18} />}
    </span>
  );
}

function Bar({ pct, met, className = '' }: { pct: number; met: boolean; className?: string }) {
  return (
    <span className={['block h-1.5 rounded-full bg-cream-dark/70 dark:bg-dark-surface overflow-hidden', className].join(' ')} aria-hidden>
      <span
        className={['block h-full rounded-full transition-[width] duration-300', met ? 'bg-[image:var(--gradient-gold)]' : 'bg-[image:var(--gradient-teal)]'].join(' ')}
        style={{ width: `${Math.max(pct, pct > 0 ? 3 : 0)}%` }}
      />
    </span>
  );
}

function WirdRow({ t, first, onClick }: { t: Target; first: boolean; onClick: () => void }) {
  const pct = pctOf(t);
  const finished = !!t.completedAt;
  const met = isMet(t);
  const recurring = !!t.recurrence && t.recurrence !== 'none';
  const extra = t.extra ?? 0;
  const carried = carriedOf(t);
  const unit = TARGET_UNIT_LABEL[t.unit];
  const left = t.deadline - Date.now();

  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'w-full flex items-center gap-3 px-3 py-3 rounded-[var(--radius-inner)] text-start hover:bg-teal/5 transition-colors',
        first ? '' : 'border-t border-black/[0.04] dark:border-white/[0.05]',
      ].join(' ')}
    >
      <UnitChip unit={t.unit} met={met || finished} />
      <span className="flex-1 min-w-0">
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-bold text-text-primary dark:text-text-on-dark truncate">{t.title}</span>
          <span
            className={[
              'shrink-0 text-xs font-counter font-bold tabular-nums',
              met || finished ? 'text-gold-dark dark:text-gold-light' : 'text-teal dark:text-teal-light',
            ].join(' ')}
          >
            {finished ? 'أتممته' : met ? 'اكتمل' : `${toArabicDigits(pct)}٪`}
          </span>
        </span>
        {!finished ? <Bar pct={pct} met={met} className="mt-1.5" /> : null}
        <span className="mt-1.5 flex items-center gap-x-2 gap-y-1 text-[11px] text-text-muted flex-wrap">
          <span className="font-counter tabular-nums">
            {toArabicDigits(Math.min(t.current, t.total))} من {toArabicDigits(t.total)} {unit}
          </span>
          {!finished ? (
            <span className="inline-flex items-center gap-0.5">
              <Clock size={10} /> {met && recurring ? `يتجدّد بعد ${remainingTimeAr(left)}` : remainingTimeAr(left)}
            </span>
          ) : null}
          {extra > 0 ? <span className="font-semibold text-gold-dark dark:text-gold-light">نافلة +{toArabicDigits(extra)}</span> : null}
          {carried > 0 && !finished ? (
            <span className="inline-flex items-center gap-0.5 font-semibold text-warning dark:text-gold-light">
              <Layers size={10} /> مُرحَّل +{toArabicDigits(carried)}
            </span>
          ) : null}
          {recurring && (t.streak ?? 0) > 0 ? (
            <span className="inline-flex items-center gap-0.5 font-semibold text-gold-dark dark:text-gold-light">
              <Flame size={11} /> {toArabicDigits(t.streak ?? 0)}
            </span>
          ) : null}
        </span>
      </span>
      <ChevronLeft size={16} className="text-text-muted shrink-0" />
    </button>
  );
}
