import { useNavigate } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { BadgeEmblem } from '@/components/badges/BadgeEmblem';
import { LevelSeal } from '@/components/badges/badgeUi';
import { useBadgeStore } from '@/store/badgeStore';
import { useBadgeModel, type BadgeItem } from '@/services/BadgeEngine';
import { toArabicDigits } from '@/utils/arabicFormat';

/**
 * «خزانة الأوسمة» on the «أنا» tab: level, points, and the badges the user
 * pinned (or, until they pin any, their latest three).
 */
export function BadgesShowcase() {
  const navigate = useNavigate();
  const model = useBadgeModel();
  const featured = useBadgeStore((s) => s.featured);
  const pinned = featured.map((id) => model.byId.get(id)).filter((x): x is BadgeItem => !!x?.unlocked);
  const shown = pinned.length ? pinned : model.recent.slice(0, 3);
  const lvl = model.level;

  return (
    <Card variant="night" className="p-4" onClick={() => navigate('/badges')} pressable>
      <div className="relative flex items-center gap-3">
        <LevelSeal rank={lvl.level.rank} size={60} onDark />
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-gold-light/85">خزانة الأوسمة</p>
          <p className="font-display text-lg font-bold leading-tight text-text-on-dark truncate">
            المستوى {toArabicDigits(lvl.level.rank)}، «{lvl.level.titleAr}»
          </p>
          <div className="mt-1.5 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full rounded-full bg-[image:var(--gradient-gold)]" style={{ width: `${lvl.pct}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-text-on-dark/70">
            {toArabicDigits(model.got)} من {toArabicDigits(model.total)} وساماً، {toArabicDigits(model.points)} نقطة
          </p>
        </div>
        <ChevronLeft size={18} className="text-text-on-dark/60 shrink-0" />
      </div>
      {shown.length ? (
        <div className="relative mt-4 grid grid-cols-3 gap-2">
          {shown.map((it) => (
            <div key={it.badge.id} className="rounded-[var(--radius-inner)] bg-white/[0.06] ring-1 ring-white/[0.06] py-2.5 px-1.5 flex flex-col items-center gap-1 text-center">
              <BadgeEmblem icon={it.badge.icon} rarity={it.badge.rarity} unlocked size={48} />
              <span className="text-[11px] font-bold leading-tight text-text-on-dark line-clamp-2">{it.badge.titleAr}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="relative mt-3 text-xs text-text-on-dark/75">أكثر من ثلاثمئة وسام في أربعة عشر باباً، ابدأ بأولها اليوم</p>
      )}
      {!pinned.length && shown.length ? (
        <p className="relative mt-2 text-[10.5px] text-text-on-dark/55 text-center">آخر ما أحرزت — ثبّت أوسمتك المفضّلة من صفحة كل وسام</p>
      ) : null}
    </Card>
  );
}
