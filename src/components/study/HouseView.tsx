import { useEffect, useState } from 'react';
import {
  Baby, Backpack, Bath, BookOpenCheck, Brush, BrushCleaning, Bus, CakeSlice,
  Coffee, CookingPot, Drill, Droplets, Fence, FileText, HandHeart, HeartPulse, House,
  Layers, MapPin, Moon, Package, Puzzle, Refrigerator, Scissors, Shirt, ShoppingBasket, ShowerHead, Sofa,
  Soup, Trash2, UtensilsCrossed, WashingMachine, Wind, Wrench, type LucideIcon,
} from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Card } from '@/components/ui/Card';
import { SectionTitle } from '@/components/ui/Ornament';
import { useHouseStore } from '@/store/houseStore';
import { useSettingsStore } from '@/store/settingsStore';
import { clockAr, dayKey } from '@/store/studyModel';
import {
  GROUP_LABEL, MEALS, MEAL_LABEL, chorePoints, choresFor, entryLabel, pointsRange, type Chore, type ChoreGroup,
  type HouseMeal,
} from '@/data/houseChores';
import { toArabicDigits as ar } from '@/utils/arabicFormat';
import { toast } from '@/store/toastStore';
import { Field, Pill, useNow } from './studyUi';

const ICON: Record<string, LucideIcon> = {
  cook: CookingPot,
  sweets: CakeSlice,
  dishes: UtensilsCrossed,
  kitchen: Refrigerator,
  laundry: WashingMachine,
  hang: Wind,
  fold: Layers,
  iron: Shirt,
  sew: Scissors,
  tidy: Sofa,
  sweep: Brush,
  mop: Droplets,
  bathroom: ShowerHead,
  deep: BrushCleaning,
  baby: Baby,
  feed: Soup,
  kidsBath: Bath,
  kidsSleep: Moon,
  schoolPrep: Backpack,
  homework: BookOpenCheck,
  kidsTime: Puzzle,
  nursing: HeartPulse,
  shopping: ShoppingBasket,
  schoolRun: Bus,
  errands: MapPin,
  papers: FileText,
  repair: Wrench,
  install: Drill,
  heavy: Package,
  outdoor: Fence,
  helpHome: HandHeart,
  trash: Trash2,
  guests: Coffee,
};

/** The user's chores under their headings, in `choresFor`'s order (her side's groups first). */
function grouped(chores: Chore[]): [ChoreGroup, Chore[]][] {
  const by = new Map<ChoreGroup, Chore[]>();
  for (const c of chores) by.set(c.group, [...(by.get(c.group) ?? []), c]);
  return [...by];
}

/** The meal by the clock: before 11 the breakfast, before 5 pm the lunch. */
const mealNow = (): HouseMeal => {
  const h = new Date().getHours();
  return h < 11 ? 'breakfast' : h < 17 ? 'lunch' : 'dinner';
};

/** Log a chore for today, with its «تقبّل الله» toast — the tab and Home's reminder. */
export function logChore(chore: string, kind?: string, meal?: HouseMeal) {
  useHouseStore.getState().log(chore, kind, meal);
  toast.success(`تقبّل الله · +${ar(chorePoints({ chore, kind }))}`, entryLabel({ chore, kind, meal }));
}

/** Pick the kind (and the meal, for cooking) of a chore that has several. */
export function KindSheet({ chore, onClose, onPick }: { chore: Chore | null; onClose: () => void; onPick: (kind: string, meal?: HouseMeal) => void }) {
  const [meal, setMeal] = useState<HouseMeal>(mealNow);
  useEffect(() => {
    if (chore) setMeal(mealNow());
  }, [chore]);
  return (
    <BottomSheet open={!!chore} onClose={onClose} title={chore?.label ?? ''}>
      {chore ? (
        <div className="flex flex-col gap-4">
          {chore.hint ? <p className="text-[12.5px] text-text-muted text-pretty">{chore.hint}</p> : null}
          {chore.meals ? (
            <Field label="الوجبة">
              <div className="flex gap-2">
                {MEALS.map((m) => (
                  <Pill key={m} active={meal === m} onClick={() => setMeal(m)} className="flex-1">
                    {MEAL_LABEL[m]}
                  </Pill>
                ))}
              </div>
            </Field>
          ) : null}
          <div className="flex flex-col gap-2">
            {chore.kinds?.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => onPick(k.id, chore.meals ? meal : undefined)}
                className="flex items-center gap-3 rounded-[var(--radius-inner)] bg-cream-dark/50 dark:bg-white/[0.05] px-3.5 py-3 text-start ring-1 ring-black/[0.04] dark:ring-white/[0.06] hover:bg-teal/5 active:scale-[0.99] transition-[background-color,transform]"
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-text-primary dark:text-text-on-dark">{k.label}</span>
                  {k.hint ? <span className="block text-xs text-text-muted">{k.hint}</span> : null}
                </span>
                <span className="font-counter tabular-nums text-sm font-bold text-gold-dark dark:text-gold-light">+{ar(k.points)}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </BottomSheet>
  );
}

/**
 * «مهام المنزل»: tap what you did today — cooking (meal × size), laundry,
 * dishes, cleaning, the children, shopping, repairs… — each by its effort on
 * «الترتيب» (data/houseChores.ts). Today's list with its points below.
 */
export function HouseView() {
  const gender = useSettingsStore((s) => s.gender);
  const female = gender === 'female';
  const entries = useHouseStore((s) => s.entries);
  const remove = useHouseStore((s) => s.remove);
  const now = useNow();
  const today = dayKey(now);
  const todays = entries.filter((e) => e.day === today);
  const total = todays.reduce((n, e) => n + chorePoints(e), 0);
  const [pick, setPick] = useState<Chore | null>(null);

  return (
    <>
      <Card variant="gradient-edge" className="p-4 flex items-center gap-3">
        <span className="w-12 h-12 rounded-2xl bg-gold/15 text-gold-dark dark:text-gold-light inline-flex items-center justify-center shrink-0">
          <House size={22} aria-hidden />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[13px] font-semibold text-text-primary dark:text-text-on-dark text-pretty">
            «كان النبي ﷺ يكون في مهنة أهله»
          </span>
          <span className="block text-[11px] text-text-muted">رواه البخاري · بنيّةٍ صالحة تصير عبادة</span>
        </span>
        <span className="flex flex-col items-end shrink-0">
          <span className="font-counter text-2xl font-bold tabular-nums text-gold-dark dark:text-gold-light leading-none">{ar(total)}</span>
          <span className="text-[10.5px] text-text-muted mt-1">نقاط اليوم</span>
        </span>
      </Card>

      <section className="flex flex-col gap-2.5">
        <SectionTitle
          title="سجّل ما أنجزته"
          subtitle={female ? 'اختاري المهمة ثم قدرها — لكلٍّ نقاطها في الترتيب' : 'اختر المهمة ثم قدرها — لكلٍّ نقاطها في الترتيب'}
        />
        {grouped(choresFor(gender)).map(([group, chores]) => (
          <div key={group} role="group" aria-labelledby={`house-${group}`} className="flex flex-col gap-1.5">
            <h3 id={`house-${group}`} className="px-1 pt-1 text-xs font-semibold text-text-secondary dark:text-text-on-dark/75">
              {GROUP_LABEL[group]}
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {chores.map((c) => {
                const Icon = ICON[c.id] ?? House;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setPick(c)}
                    className="flex flex-col items-center gap-1.5 rounded-[var(--radius-inner)] bg-white dark:bg-dark-card ring-1 ring-black/[0.05] dark:ring-white/[0.07] px-1.5 py-3 text-center hover:bg-teal/5 active:scale-[0.98] transition-[background-color,transform]"
                  >
                    <span className="w-10 h-10 rounded-xl bg-teal/10 text-teal dark:bg-teal/15 dark:text-teal-light inline-flex items-center justify-center">
                      <Icon size={19} strokeWidth={1.9} aria-hidden />
                    </span>
                    <span className="text-[12px] font-semibold leading-snug text-text-primary dark:text-text-on-dark text-balance">
                      {c.label}
                    </span>
                    <span className="mt-auto font-counter tabular-nums text-[11px] font-bold text-gold-dark dark:text-gold-light">+{ar(pointsRange(c))}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-2.5">
        <SectionTitle title="أنجزته اليوم" subtitle={todays.length ? `${ar(todays.length)} من مهام البيت` : undefined} />
        {todays.length ? (
          <Card className="p-1.5">
            <ul className="flex flex-col">
              {todays.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-2.5 py-2">
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-semibold text-text-primary dark:text-text-on-dark truncate">{entryLabel(e)}</span>
                    <span className="block text-[11px] text-text-muted">{clockAr(e.at)}</span>
                  </span>
                  <span className="font-counter tabular-nums text-[13px] font-bold text-gold-dark dark:text-gold-light">+{ar(chorePoints(e))}</span>
                  <button
                    type="button"
                    aria-label={`حذف ${entryLabel(e)}`}
                    onClick={() => remove(e.id)}
                    className="w-9 h-9 inline-flex items-center justify-center rounded-full text-text-muted hover:text-danger hover:bg-danger/10"
                  >
                    <Trash2 size={16} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <p className="text-[12.5px] text-text-muted text-pretty">
            {female ? 'لم تسجّلي شيئاً اليوم بعد — اضغطي المهمة حين تُنجزينها.' : 'لم تسجّل شيئاً اليوم بعد — اضغط المهمة حين تُنجزها.'}
          </p>
        )}
      </section>

      <KindSheet
        chore={pick}
        onClose={() => setPick(null)}
        onPick={(kind, meal) => {
          if (pick) logChore(pick.id, kind, meal);
          setPick(null);
        }}
      />
    </>
  );
}
