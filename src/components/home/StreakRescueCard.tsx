import { useNavigate } from 'react-router';
import { Flame } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Medallion, SectionTitle } from '@/components/ui/Ornament';
import { useRescueOffers, rescueMultiplier, type RescueOffer } from '@/services/streakRescue';
import { days, nights } from '@/services/insightsEngine';
import { useStreakRescueStore } from '@/store/streakRescueStore';
import { useTargetsStore, RESCUE_WINDOW } from '@/store/targetsStore';
import { formatNumberAr, toArabicDigits } from '@/services/statsService';

/**
 * «استعد سلسلتك» — one card per broken streak (أذكار، قيام، أوراد) still inside
 * its week: do today's amount +50% per missed day and the chain comes back.
 */
export function StreakRescueCard() {
  const offers = useRescueOffers();
  if (offers.length === 0) return null;
  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle title="استعد سلسلتك" subtitle="انقطعت؟ زِد اليوم وتعود متصلة" />
      {offers.map((o) => (
        <OfferCard key={o.key} offer={o} />
      ))}
    </section>
  );
}

export function OfferCard({ offer: o }: { offer: RescueOffer }) {
  const navigate = useNavigate();
  const dismiss = useStreakRescueStore((s) => s.dismiss);
  const acceptRescue = useTargetsStore((s) => s.acceptRescue);
  const pct = Math.round(rescueMultiplier(o.step) * 100);
  const daysLeft = RESCUE_WINDOW - o.step + 1;
  const needsAccept = !!o.targetId && !o.accepted;
  const progress = Math.min(100, Math.round((o.done / Math.max(1, o.required)) * 100));
  const lost = o.key === 'qiyam' ? nights(o.lost) : days(o.lost);

  return (
    <div className="rounded-[var(--radius-card)] p-3.5 ring-1 ring-gold/35 bg-[image:var(--gradient-hero-light)] dark:bg-[image:var(--gradient-hero-dark)] flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <Medallion size={46} tone="gold">
          <Flame size={18} className="text-gold-dark dark:text-gold-light" />
        </Medallion>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold text-gold-dark dark:text-gold-light">انقطعت سلسلة {lost}</p>
          <p className="text-[15px] font-bold text-text-primary dark:text-text-on-dark truncate">{o.title}</p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-text-secondary dark:text-text-on-dark/75 text-pretty">
            أتمّ اليوم {formatNumberAr(o.required)} {o.unit} ({toArabicDigits(pct)}٪ من المعتاد) لتعود سلسلتك متصلة.
            الزيادة ثمن السلسلة لا نافلة.
          </p>
        </div>
      </div>

      {!needsAccept ? (
        <div>
          <div className="h-1.5 rounded-full bg-white/60 dark:bg-dark-surface overflow-hidden" aria-hidden>
            <div className="h-full rounded-full bg-[image:var(--gradient-gold)] transition-[width] duration-300" style={{ width: `${progress}%` }} />
          </div>
          <p className="mt-1 font-counter tabular-nums text-[11px] text-text-muted">
            {formatNumberAr(Math.min(o.done, o.required))} / {formatNumberAr(o.required)} {o.unit}
          </p>
        </div>
      ) : null}

      <p className="text-[10.5px] text-text-muted">
        {daysLeft > 1
          ? `يرتفع العرض ٥٠٪ عن كل يوم تؤجّله، وينتهي بعد ${days(daysLeft - 1)}`
          : 'آخر يوم للعرض'}
      </p>

      <div className="flex items-center gap-2">
        <Button
          variant="gold"
          size="sm"
          haptic="light"
          onClick={() => {
            if (needsAccept && o.targetId) acceptRescue(o.targetId);
            navigate(o.to);
          }}
        >
          {needsAccept ? 'قبول التحدي' : 'تابِع الآن'}
        </Button>
        <Button variant="ghost" size="sm" haptic="light" onClick={() => dismiss(o.key, o.dayKey)}>
          ليس اليوم
        </Button>
      </div>
    </div>
  );
}
