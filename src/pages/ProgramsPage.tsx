import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Plus } from 'lucide-react';
import { TopAppBar } from '@/components/layout/TopAppBar';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { ProgramsHub } from '@/components/programs/ProgramsHub';
import { TemplatePreview } from '@/components/programs/TemplatePreview';
import { RunDetail } from '@/components/programs/RunDetail';
import { BuilderSheet, type BuilderInit } from '@/components/programs/BuilderSheet';
import { CompletionModal } from '@/components/programs/CompletionModal';
import { useProgramEvals } from '@/components/programs/programsUi';
import { useProgramsStore } from '@/store/programsStore';
import { reconcilePrograms } from '@/services/programsSources';
import { rescheduleAllPrograms } from '@/services/programsReminders';
import { templateById } from '@/data/programsCatalog';
import type { ProgramRun, RunEval } from '@/store/programsModel';

/** The next level of a finished run: its template's `next`, else the builder from where it ended. */
function levelUpOf(run: ProgramRun, ev: RunEval): { tpl: string } | { build: BuilderInit } {
  const next = templateById(templateById(run.templateId)?.next);
  if (next) return { tpl: next.id };
  if (run.templateId === 'quitHabit') return { tpl: 'quitHabit' };
  const last = ev.def.steps[ev.def.steps.length - 1];
  const c = run.custom;
  const unit = c?.unit ?? (ev.def.unit === 'pages' || ev.def.unit === 'rakaat' || ev.def.unit === 'count' ? ev.def.unit : 'check');
  return {
    build: {
      title: c?.title ?? ev.def.title,
      unit,
      days: c?.days ?? ev.def.steps.length,
      start: last,
      end: unit === 'rakaat' ? last + 2 : Math.ceil(last * 1.5),
      curve: c?.curve ?? 'weekly',
      autoQuran: c?.autoQuran ?? ev.def.verify === 'quran',
      grace: run.grace,
    },
  };
}

/**
 * «برامج التدرّج» — /programs (hub) · ?tpl=<id> (preview & start) · ?run=<id> (a program).
 * `embedded`: the body alone, inside «عباداتي» (/targets?tab=programs, same params).
 */
export function ProgramsPage({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const runId = params.get('run');
  const tplId = params.get('tpl');
  const { runs, evals, src } = useProgramEvals();
  const markCelebrated = useProgramsStore((s) => s.markCelebrated);
  const [builder, setBuilder] = useState<{ open: boolean; initial?: BuilderInit }>({ open: false });

  // Stamp verified days / close finished runs whenever the data moves; arm reminders once.
  useEffect(() => reconcilePrograms(), [runs, src]);
  useEffect(() => {
    void rescheduleAllPrograms();
  }, []);

  const run = runId ? runs.find((r) => r.id === runId) : undefined;
  const ev = run ? evals.get(run.id) : undefined;
  const tpl = !run && tplId ? templateById(tplId) : undefined;

  const celebrate = useMemo(() => runs.find((r) => evals.get(r.id)?.finishedOn && !r.celebrated), [runs, evals]);
  const celebrateEv = celebrate ? (evals.get(celebrate.id) ?? null) : null;

  const levelUp = (r: ProgramRun, e: RunEval) => {
    const l = levelUpOf(r, e);
    if ('tpl' in l) navigate(`/programs?tpl=${l.tpl}`);
    else setBuilder({ open: true, initial: l.build });
  };

  const title = run ? 'برنامجك' : tpl ? 'برنامج جديد' : 'برامج التدرّج';
  const subtitle = run || tpl ? 'برامج التدرّج' : 'عبادةٌ تكبر معك يوماً بيوم';

  const body =
    runId && !run ? (
      <EmptyState
        title="لم نجد هذا البرنامج"
        description="ربما حُذف من جهازٍ آخر."
        cta={{ label: 'برامج التدرّج', onClick: () => navigate(embedded ? '/targets?tab=programs' : '/programs', { replace: true }) }}
      />
    ) : run && ev ? (
      <RunDetail key={run.id} run={run} ev={ev} onLevelUp={() => levelUp(run, ev)} />
    ) : tpl ? (
      <TemplatePreview key={tpl.id} tpl={tpl} />
    ) : (
      <ProgramsHub onBuild={() => setBuilder({ open: true })} />
    );

  return (
    <div className={embedded ? undefined : 'min-h-dvh bg-cream dark:bg-dark-bg'} dir="rtl">
      {embedded ? (
        body
      ) : (
        <>
          <TopAppBar
            title={title}
            subtitle={subtitle}
            showBack
            actions={
              !run && !tpl ? (
                <Button variant="icon" aria-label="صمّم برنامجك" onClick={() => setBuilder({ open: true })}>
                  <Plus size={18} />
                </Button>
              ) : undefined
            }
          />
          <main className="px-4 pt-4 pb-28 mx-auto w-full max-w-3xl">{body}</main>
        </>
      )}

      <BuilderSheet open={builder.open} initial={builder.initial} onClose={() => setBuilder({ open: false })} />
      <CompletionModal
        ev={celebrateEv}
        open={!!celebrate}
        onClose={() => celebrate && markCelebrated(celebrate.id)}
        onNext={() => {
          if (!celebrate || !celebrateEv) return;
          markCelebrated(celebrate.id);
          levelUp(celebrate, celebrateEv);
        }}
      />
    </div>
  );
}
