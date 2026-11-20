import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import { useNavigate } from 'react-router';
import { motion, AnimatePresence } from '@/lib/motion';
import { OrnamentRule, Star8 } from '@/components/ui/Ornament';
import { Button } from '@/components/ui/Button';
import { Sparkle } from '@/components/ui/Sparkle';
import { useCloseOnBack } from '@/lib/overlayBack';
import { CrownEmblem } from '@/components/crowns/CrownEmblem';
import { crownTitle, emblemOf, momentKey, newlyWon, streakText, type CrownPeriod } from '@/services/crowns';
import { crownKeys, useCrowns, useLeaderboardStore } from '@/services/leaderboard';
import { useBadgeCelebrationStore } from '@/services/BadgeEngine';
import { useSettingsStore } from '@/store/settingsStore';
import { toArabicDigits as ar } from '@/utils/arabicFormat';

const TAB: Record<CrownPeriod, string> = { day: 'today', week: 'week', month: 'month' };
const IN: Record<CrownPeriod, string> = { day: 'اليوم', week: 'هذا الأسبوع', month: 'هذا الشهر' };
const WORD: Record<CrownPeriod, string> = { day: 'اليوم', week: 'الأسبوع', month: 'الشهر' };

/**
 * «توّجت بتاج الأسبوع» — once per (period, period key), the first time I take a
 * crown. Mounted on Home and «الترتيب»; waits for a badge celebration to clear.
 */
export function CrownMoment() {
  const navigate = useNavigate();
  const crowns = useCrowns();
  const celebrated = useLeaderboardStore((s) => s.crownMoments);
  const badgeBusy = useBadgeCelebrationStore((s) => s.queue.length > 0);
  const reduceSetting = useSettingsStore((s) => s.reduceMotion);
  const fresh = useMemo(() => newlyWon(crowns, celebrated), [crowns, celebrated]);
  const [shown, setShown] = useState<CrownPeriod[] | null>(null);
  const [burst, setBurst] = useState(false);

  // A beat after the page settles, never over another celebration.
  useEffect(() => {
    if (shown || !fresh.length || badgeBusy) return;
    const t = setTimeout(() => setShown(fresh), 900);
    return () => clearTimeout(t);
  }, [fresh, shown, badgeBusy]);

  const reduced = reduceSetting || (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    if (!shown || reduced) return;
    const t1 = setTimeout(() => setBurst(true), 850);
    const t2 = setTimeout(() => setBurst(false), 1800);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [shown, reduced]);

  const close = () => {
    if (!shown) return;
    const keys = crownKeys();
    const done = shown.map((p) => momentKey(p, crowns[p]?.key ?? keys[p]));
    useLeaderboardStore.setState((s) => ({ crownMoments: [...s.crownMoments, ...done.filter((k) => !s.crownMoments.includes(k))].slice(-40) }));
    setShown(null);
  };
  useCloseOnBack(!!shown, close);
  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const emblem = useMemo(() => emblemOf(crowns, { name: null, tag: -1, isMe: true }), [crowns]);
  const lead = shown ? [...shown].reverse().map((p) => crowns[p]).find(Boolean) : undefined;
  const leadPeriod = shown ? [...shown].reverse().find((p) => crowns[p]) : undefined;

  return (
    <AnimatePresence>
      {shown && emblem && lead && leadPeriod ? (
        <motion.div
          key="crown-moment"
          className="fixed inset-0 z-[80] flex items-center justify-center px-6 bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={close}
          dir="rtl"
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="crown-moment-title"
            className="relative w-full max-w-sm max-h-[90dvh] overflow-y-auto overflow-x-hidden no-scrollbar rounded-[var(--radius-card)] bg-[image:var(--gradient-night)] ring-1 ring-gold/40 shadow-[var(--shadow-lg)] px-6 pt-6 pb-6 text-center text-text-on-dark"
            initial={{ opacity: 0, scale: 0.94, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e: MouseEvent) => e.stopPropagation()}
          >
            <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
              <span className="lattice lattice-fade text-gold" />
              <Star8 size={150} filled={false} className="absolute -top-12 -start-12 text-gold/15" />
              <Star8 size={100} filled={false} className="absolute -bottom-10 -end-10 text-gold/12" />
            </span>

            <p className="relative text-[12px] font-bold text-gold-light/90">
              الأول في ترتيب {emblem.periods.map((p) => WORD[p]).join(' و')}
            </p>

            <div className="relative mt-2 mx-auto flex h-[176px] w-[176px] items-center justify-center">
              <span aria-hidden className="absolute inset-6 rounded-full bg-gold/25 blur-2xl badge-glow" />
              <span aria-hidden className="crown-ring opacity-0 absolute inset-8 rounded-full ring-2 ring-gold-light/70" />
              <span className="crown-descend relative">
                <CrownEmblem emblem={emblem} size={emblem.full ? 84 : emblem.periods.some((p) => p !== 'day') ? 100 : 118} />
              </span>
              <Sparkle show={burst} count={14} size={5} color="var(--color-gold-light)" />
            </div>

            <h2 id="crown-moment-title" className="relative mt-1 font-display text-[26px] font-bold leading-tight text-balance">
              {shown.length === 3 ? 'توّجت بالتاج الكامل' : `توّجت ب${crownTitle(shown)}`}
            </h2>
            {emblem.periods.length > shown.length ? (
              <p className="relative mt-1 text-[13px] font-semibold text-gold-light">
                {emblem.full ? 'اجتمعت لك التيجان الثلاثة: التاج الكامل' : `وصار تاجك: ${crownTitle(emblem.periods)}`}
              </p>
            ) : null}
            <p className="relative mt-2 text-[13.5px] leading-relaxed text-text-on-dark/80 text-pretty">
              تتقدّم {IN[leadPeriod]} بين {ar(lead.total)} {lead.total <= 10 ? 'مشاركين' : 'مشاركاً'}، ويبقى التاج لك ما دمت في المقدمة.
            </p>
            {emblem.streak || emblem.dominant ? (
              <p className="relative mt-3 flex flex-wrap justify-center gap-1.5 text-[11.5px] font-bold">
                {emblem.streak ? (
                  <span className="rounded-full bg-gold/15 ring-1 ring-gold/35 px-2.5 py-1 text-gold-light">{streakText(emblem.streak.period, emblem.streak.n)}</span>
                ) : null}
                {emblem.dominant ? <span className="rounded-full bg-gold/15 ring-1 ring-gold/35 px-2.5 py-1 text-gold-light">بفارقٍ واسع</span> : null}
              </p>
            ) : null}

            <OrnamentRule className="relative my-4 mx-8" />
            <p className="relative font-quran text-[19px] leading-loose text-gold-light">﴿وَفِي ذَٰلِكَ فَلْيَتَنَافَسِ الْمُتَنَافِسُونَ﴾</p>
            <p className="relative text-[11px] text-text-on-dark/60">المطففين: ٢٦</p>
            <p className="relative mt-3 text-[12px] leading-relaxed text-text-on-dark/75 text-pretty">
              الترتيب حافزٌ على المسارعة في الخير، لا ميزانٌ للقبول. فأخلص نيتك، واسأل الله أن يتقبّل منك.
            </p>

            <div className="relative mt-5 flex gap-2.5">
              <Button
                variant="gold"
                className="flex-1"
                onClick={() => {
                  close();
                  navigate(`/leaderboard?tab=${TAB[leadPeriod]}`);
                }}
              >
                عرض الترتيب
              </Button>
              <button
                type="button"
                onClick={close}
                className="flex-1 min-h-12 rounded-[var(--radius-btn)] bg-white/10 hover:bg-white/15 text-text-on-dark text-[15px] font-bold transition-colors"
              >
                الحمد لله
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
