import { useNavigate } from 'react-router';
import { AlertTriangle, ChevronLeft, PenLine, Sparkles, Trophy } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { ArchMotif, SectionTitle } from '@/components/ui/Ornament';
import { useSettingsStore } from '@/store/settingsStore';
import { lengthText, WARN_RUNNING, type ProgramRun, type RunEval } from '@/store/programsModel';
import { CATEGORIES, LEVEL_LABEL, STEADY_HADITH, templateById, templatesFor, type ProgramTemplate } from '@/data/programsCatalog';
import { parseKey } from '@/store/studyModel';
import { toArabicDigits as ar } from '@/utils/arabicFormat';
import { RunCard } from './RunCard';
import { IconChip, isRunning, useProgramEvals } from './programsUi';

const shortDate = (key: string) => {
  const d = parseKey(key);
  return `${ar(d.getDate())}/${ar(d.getMonth() + 1)}/${ar(d.getFullYear())}`;
};

/** What to suggest next: the level after the latest finish, else a gentle first step. */
export function suggestNext(runs: ProgramRun[], evals: Map<string, RunEval>, gender: 'male' | 'female' | null): ProgramTemplate | undefined {
  const busy = new Set(runs.filter((r) => isRunning(r.status, evals.get(r.id))).map((r) => r.templateId));
  const allowed = new Set(templatesFor(gender).map((t) => t.id));
  const finished = runs
    .filter((r) => evals.get(r.id)?.finishedOn)
    .sort((a, b) => (evals.get(b.id)!.finishedOn! > evals.get(a.id)!.finishedOn! ? 1 : -1));
  for (const r of finished) {
    const next = templateById(templateById(r.templateId)?.next);
    if (next && allowed.has(next.id) && !busy.has(next.id)) return next;
  }
  const done = new Set(finished.map((r) => r.templateId));
  const first = gender === 'male' ? ['jamaah21', 'adhkar30', 'duha30'] : ['adhkar30', 'duha30', 'istighfar40'];
  return first.map((id) => templateById(id)!).find((t) => allowed.has(t.id) && !busy.has(t.id) && !done.has(t.id));
}

function CatalogRow({ t, running }: { t: ProgramTemplate; running: boolean }) {
  const navigate = useNavigate();
  return (
    <li>
      <button
        type="button"
        onClick={() => navigate(`/programs?tpl=${t.id}`)}
        className="w-full flex items-center gap-3 rounded-[var(--radius-inner)] px-3 py-3 text-start hover:bg-teal/5 active:bg-teal/10 transition-colors"
      >
        <IconChip def={t} size={40} />
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] font-bold leading-snug text-text-primary dark:text-text-on-dark text-balance">{t.title}</span>
          <span className="block text-[12px] text-text-muted text-pretty">{t.short}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="rounded-full bg-cream-dark/70 dark:bg-white/[0.07] px-2 py-0.5 text-text-secondary dark:text-text-on-dark/75">{lengthText(t)}</span>
            <span className={`rounded-full px-2 py-0.5 ${t.level === 3 ? 'bg-gold/15 text-gold-dark dark:text-gold-light' : 'bg-teal/10 text-teal dark:text-teal-light'}`}>
              {LEVEL_LABEL[t.level]}
            </span>
            {running ? <span className="rounded-full bg-teal text-on-accent px-2 py-0.5">جارٍ</span> : null}
          </span>
        </span>
        <ChevronLeft size={18} className="text-text-muted shrink-0" aria-hidden />
      </button>
    </li>
  );
}

/** /programs: today's steps, the running programs, the catalogue, the builder and the finished ones. */
export function ProgramsHub({ onBuild }: { onBuild: () => void }) {
  const navigate = useNavigate();
  const gender = useSettingsStore((s) => s.gender);
  const { runs, evals } = useProgramEvals();
  const running = runs.filter((r) => isRunning(r.status, evals.get(r.id)));
  const started = running.filter((r) => evals.get(r.id)!.started && !evals.get(r.id)!.paused);
  const dueToday = started.filter((r) => ['pending', 'done'].includes(evals.get(r.id)!.today?.state ?? ''));
  const doneToday = dueToday.filter((r) => evals.get(r.id)!.today?.state === 'done');
  const history = runs
    .filter((r) => !isRunning(r.status, evals.get(r.id)))
    .sort((a, b) => ((b.finishedOn ?? b.endedOn ?? '') > (a.finishedOn ?? a.endedOn ?? '') ? 1 : -1));
  const busy = new Set(running.map((r) => r.templateId));
  const catalog = templatesFor(gender);
  const suggestion = suggestNext(runs, evals, gender);
  const pct = dueToday.length ? (doneToday.length / dueToday.length) * 100 : 0;

  return (
    <div className="flex flex-col gap-6">
      {/* ── hero ── */}
      {running.length ? (
        <Card variant="hero" className="p-5">
          <ArchMotif className="absolute -top-6 -start-8 w-40 opacity-15" />
          <div className="relative flex items-center gap-4">
            <div className="relative shrink-0">
              <ProgressRing
                value={pct}
                size={76}
                strokeWidth={6}
                showPercent={false}
                colorFrom="var(--color-on-accent)"
                colorTo="var(--color-gold-light)"
                trackColor="color-mix(in srgb, var(--color-on-accent) 18%, transparent)"
              />
              <span className="absolute inset-0 flex items-center justify-center text-[15px] font-counter font-bold tabular-nums">
                {ar(doneToday.length)}/{ar(dueToday.length)}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-on-accent/75">خطوات اليوم</p>
              <h2 className="mt-1 text-xl font-display font-bold leading-snug text-balance">
                {!dueToday.length
                  ? 'لا خطوات اليوم'
                  : doneToday.length === dueToday.length
                    ? `${gender === 'female' ? 'أتممتِ' : 'أتممتَ'} خطوات اليوم كلها`
                    : `بقي ${ar(dueToday.length - doneToday.length)} من ${ar(dueToday.length)}`}
              </h2>
              <p className="mt-1 text-[12.5px] text-on-accent/80 text-pretty">«{STEADY_HADITH.text}»</p>
            </div>
          </div>
        </Card>
      ) : (
        <Card variant="gradient-edge" className="p-5">
          <ArchMotif className="absolute -top-6 -end-4 w-28 text-gold opacity-20" />
          <div className="relative">
            <p className="text-xs text-text-muted">برامج التدرّج</p>
            <h2 className="mt-1 text-xl font-display font-bold leading-snug text-text-primary dark:text-text-on-dark text-balance">
              عبادةٌ تكبر معك يوماً بيوم
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-text-secondary dark:text-text-on-dark/80 text-pretty">
              تبدأ بالقليل الذي تقدر عليه، ويزيد البرنامج خطوةً بعد خطوة حتى تصير العبادة عادتك. «{STEADY_HADITH.text}» ({STEADY_HADITH.ref}).
            </p>
            {suggestion ? (
              <Button variant="primary" size="md" className="mt-4" onClick={() => navigate(`/programs?tpl=${suggestion.id}`)}>
                ابدأ بـ«{suggestion.title}»
              </Button>
            ) : null}
          </div>
        </Card>
      )}

      {running.length > WARN_RUNNING ? (
        <Card variant="inset" className="p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5 text-warning shrink-0" aria-hidden />
          <p className="text-[12.5px] leading-relaxed text-text-secondary dark:text-text-on-dark/80 text-pretty">
            تحمل {ar(running.length)} برامج معاً. القليل الدائم خيرٌ من كثيرٍ منقطع، فأوقف مؤقتاً ما يُثقلك وأتمّ ما بين يديك.
          </p>
        </Card>
      ) : null}

      {running.length ? (
        <section className="flex flex-col gap-2.5">
          <SectionTitle title="برامجي الجارية" subtitle={running.length === 1 ? 'برنامج واحد' : running.length === 2 ? 'برنامجان' : `${ar(running.length)} برامج`} />
          <div className="grid gap-3 lg:grid-cols-2">
            {running.map((r) => (
              <RunCard key={r.id} run={r} ev={evals.get(r.id)!} />
            ))}
          </div>
        </section>
      ) : null}

      {suggestion && running.length ? (
        <button
          type="button"
          onClick={() => navigate(`/programs?tpl=${suggestion.id}`)}
          className="text-start rounded-[var(--radius-card)] bg-gold/[0.08] dark:bg-gold/[0.06] ring-1 ring-gold/25 p-4 flex items-center gap-3 hover:bg-gold/[0.12] transition-colors"
        >
          <Sparkles size={18} className="text-gold-dark dark:text-gold-light shrink-0" aria-hidden />
          <span className="flex-1 min-w-0">
            <span className="block text-[11.5px] text-text-muted">مقترحٌ لك</span>
            <span className="block text-[14px] font-bold text-text-primary dark:text-text-on-dark">{suggestion.title}</span>
          </span>
          <ChevronLeft size={18} className="text-text-muted" aria-hidden />
        </button>
      ) : null}

      {/* ── catalogue ── */}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        {CATEGORIES.map((c) => {
          const items = catalog.filter((t) => t.category === c.id);
          if (!items.length) return null;
          return (
            <section key={c.id} className="flex flex-col gap-2.5">
              <SectionTitle title={c.title} subtitle={c.subtitle} />
              <Card className="p-1.5">
                <ul className="flex flex-col divide-y divide-black/[0.05] dark:divide-white/[0.06]">
                  {items.map((t) => (
                    <CatalogRow key={t.id} t={t} running={busy.has(t.id)} />
                  ))}
                </ul>
              </Card>
            </section>
          );
        })}
      </div>

      <Card variant="gradient-edge" className="p-4 flex items-center gap-3">
        <span className="w-11 h-11 rounded-2xl bg-teal/10 text-teal dark:bg-teal/15 dark:text-teal-light inline-flex items-center justify-center shrink-0">
          <PenLine size={20} aria-hidden />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] font-bold text-text-primary dark:text-text-on-dark">صمّم برنامجك</span>
          <span className="block text-[12px] text-text-muted text-pretty">أي عبادة بعدد أو ركعات أو صفحات، بالتدرّج الذي يناسبك</span>
        </span>
        <Button variant="soft" size="sm" onClick={onBuild}>
          ابدأ
        </Button>
      </Card>

      {/* ── history ── */}
      {history.length ? (
        <section className="flex flex-col gap-2.5">
          <SectionTitle title="سجلّ الإنجاز" subtitle={`المكتملة ${ar(history.filter((r) => evals.get(r.id)?.finishedOn).length)} من ${ar(history.length)}`} />
          <Card className="p-1.5">
            <ul className="flex flex-col divide-y divide-black/[0.05] dark:divide-white/[0.06]">
              {history.map((r) => {
                const ev = evals.get(r.id)!;
                const finished = !!ev.finishedOn;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/programs?run=${r.id}`)}
                      className="w-full flex items-center gap-3 rounded-[var(--radius-inner)] px-3 py-3 text-start hover:bg-teal/5"
                    >
                      <span
                        className={`w-10 h-10 rounded-xl inline-flex items-center justify-center shrink-0 ${
                          finished ? 'bg-gold/15 text-gold-dark dark:text-gold-light' : 'bg-cream-dark/70 dark:bg-white/[0.07] text-text-muted'
                        }`}
                      >
                        <Trophy size={18} aria-hidden />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-[13.5px] font-bold text-text-primary dark:text-text-on-dark truncate">{ev.def.title}</span>
                        <span className="block text-[11.5px] text-text-muted">
                          {finished
                            ? `أتممته ${shortDate(ev.finishedOn!)}`
                            : `أوقفته${r.endedOn ? ` ${shortDate(r.endedOn)}` : ''} بعد ${ar(ev.doneCount)} من ${ar(ev.total)}`}
                        </span>
                      </span>
                      <ChevronLeft size={16} className="text-text-muted" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
