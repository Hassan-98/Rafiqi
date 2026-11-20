import { Play } from 'lucide-react';
import { TopAppBar } from '@/components/layout/TopAppBar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SectionTitle } from '@/components/ui/Ornament';
import { previewMindful } from '@/components/mindful/MindfulReminder';
import { MINDFUL_KICKER, MINDFUL_REMINDERS, type MindfulContext } from '@/data/mindfulReminders';
import { composeMindful } from '@/services/mindful';
import { useSettingsStore } from '@/store/settingsStore';

/** Where each one shows. */
const WHERE: Record<MindfulContext, string> = {
  open: 'عند فتح التطبيق',
  quran: 'في «القرآن»',
  adhkar: 'في «الأذكار» والتسبيح',
  prayer: 'في الصلاة',
  awrad: 'في الأوراد',
  qiyam: 'في قيام الليل',
  programs: 'في برامج التدرّج',
  numbers: 'في الترتيب والإحصاءات والأوسمة',
  sadaqah: 'في الصدقة',
  silat: 'في صلة الرحم',
  study: 'في المهام',
  review: 'في محاسبة الجمعة',
  qada: 'في قضاء ما فات',
  circles: 'في حلقات العلم',
};
const ORDER: MindfulContext[] = [
  'open', 'quran', 'adhkar', 'prayer', 'awrad', 'qiyam', 'circles', 'qada', 'programs', 'numbers', 'sadaqah', 'silat', 'study', 'review',
];

/**
 * «تذاكر الإتقان» — every reminder the app may show, as the user will read it
 * (their gender's wording), each with «اعرضها» to see it full-screen now
 * (owner 2026-11-18: try it and review them all). Not a setting: it stays on.
 */
export function MindfulPage() {
  const gender = useSettingsStore((s) => s.gender);
  const contexts = ORDER.filter((c) => MINDFUL_REMINDERS[c]?.length);
  return (
    <div className="min-h-dvh bg-cream dark:bg-dark-bg" dir="rtl">
      <TopAppBar title="تذاكر الإتقان" subtitle="العبرة بالإخلاص والإتقان والقبول، لا بالعدد" showBack />
      <div className="max-w-3xl mx-auto px-4 pt-4 pb-28 flex flex-col gap-6">
        <Card className="p-4 flex flex-col gap-3">
          <p className="text-[13.5px] leading-relaxed text-text-secondary dark:text-text-on-dark/80 text-pretty">
            «تذكرة اليوم» مرةً كل يوم في وقتٍ من الصباح، ولكل قسمٍ تذكرته مرةً في اليوم حين تفتحه. وهنا تجدها كلها،
            وتعرض أيّها شئت كما تظهر.
          </p>
          <Button fullWidth leftIcon={<Play size={16} />} onClick={() => previewMindful()}>
            جرّب الآن
          </Button>
        </Card>

        {contexts.map((ctx) => (
          <section key={ctx} className="flex flex-col gap-2.5">
            <SectionTitle title={MINDFUL_KICKER[ctx]} subtitle={WHERE[ctx]} />
            <Card className="p-1.5 divide-y divide-black/[0.05] dark:divide-white/[0.06]">
              {MINDFUL_REMINDERS[ctx].map((_, i) => {
                const c = composeMindful(ctx, i, gender);
                return (
                  <div key={i} className="px-3 py-3.5 flex flex-col gap-2">
                    <p className="text-[14px] leading-[1.95] text-text-primary dark:text-text-on-dark text-pretty">
                      <span className="font-bold text-teal dark:text-teal-light">{c.salutation}</span> {c.body}
                    </p>
                    <p
                      className={
                        c.quote.kind === 'ayah'
                          ? 'font-quran text-[17px] leading-[2] text-text-primary dark:text-text-on-dark'
                          : 'text-[13.5px] leading-[1.9] font-semibold text-text-secondary dark:text-text-on-dark/85'
                      }
                    >
                      {c.quote.text} <span className="font-sans text-[11.5px] font-normal text-text-muted">({c.quote.ref})</span>
                    </p>
                    <button
                      type="button"
                      onClick={() => previewMindful(ctx, i)}
                      className="self-end inline-flex items-center gap-1.5 min-h-9 px-3 rounded-xl text-[12.5px] font-semibold text-teal dark:text-teal-light hover:bg-teal/5"
                    >
                      <Play size={13} aria-hidden /> اعرضها
                    </button>
                  </div>
                );
              })}
            </Card>
          </section>
        ))}
      </div>
    </div>
  );
}
