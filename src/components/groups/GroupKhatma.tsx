import { useState } from 'react';
import { BookOpen, Check, Minus, Plus, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { ArchMotif, Medallion, SectionTitle } from '@/components/ui/Ornament';
import { toast } from '@/store/toastStore';
import { act, type GroupState, type Khatma } from '@/services/groups';
import {
  ANAS_KHATM,
  completionDuas,
  juzCells,
  juzList,
  khatmaProgress,
  khatmasLabel,
  personName,
  pickFreeJuz,
  type JuzCell,
  type JuzState,
} from '@/services/groupsLogic';
import { dateKeyOf, shortDateAr } from '@/services/statsService';
import { toArabicDigits } from '@/utils/arabicFormat';

const ar = toArabicDigits;
const dateAr = (iso: string) => shortDateAr(dateKeyOf(new Date(iso)));

const CELL: Record<JuzState, string> = {
  free: 'bg-cream-dark/55 dark:bg-dark-surface text-text-secondary dark:text-text-on-dark/80 ring-1 ring-black/[0.04] dark:ring-white/[0.05] hover:bg-teal/5',
  taken: 'bg-teal/8 dark:bg-teal/15 text-teal dark:text-teal-light ring-1 ring-teal/20',
  mine: 'bg-gold/12 text-gold-dark dark:text-gold-light ring-2 ring-gold/55',
  done: 'bg-[image:var(--gradient-teal)] text-on-accent',
  mineDone: 'bg-[image:var(--gradient-teal)] text-on-accent ring-2 ring-gold/70',
};
const STATE_AR: Record<JuzState, string> = { free: 'متاح', taken: 'يُقرأ', mine: 'معك', done: 'قُرئ', mineDone: 'قرأته' };

/** «الختمة الجماعية»: the running khatma's 30-juz grid, its completion, and the history. */
export function GroupKhatma({ state }: { state: GroupState }) {
  const k = state.khatma;
  const [starting, setStarting] = useState(false);
  const gid = state.group.id;

  return (
    <div className="flex flex-col gap-6">
      {!k ? (
        <Card className="p-2">
          <div className="flex flex-col items-center text-center gap-3 px-4 py-8">
            <Medallion size={72} tone="gold">
              <BookOpen size={24} className="text-gold-dark dark:text-gold-light" aria-hidden />
            </Medallion>
            <h3 className="text-lg font-display font-bold text-text-primary dark:text-text-on-dark text-balance">لا ختمة جارية</h3>
            <p className="text-sm text-text-muted max-w-xs leading-relaxed text-pretty">
              ابدأ ختمةً يتقاسم الأعضاء أجزاءها الثلاثين، ولو جزءاً لكلٍّ منهم.
            </p>
            <Button onClick={() => setStarting(true)}>ابدأ ختمة</Button>
          </div>
        </Card>
      ) : k.completedAt ? (
        <Completed k={k} readers={state.history.find((h) => h.id === k.id)?.readers ?? 0} onNext={() => setStarting(true)} />
      ) : (
        <Running k={k} groupId={gid} isOwner={state.group.isOwner} />
      )}

      {state.history.length ? (
        <section className="flex flex-col gap-2.5">
          <SectionTitle title="ختمات المجموعة" subtitle={`${khatmasLabel(state.history.length)}، تمّت بفضل الله`} />
          <Card className="p-1.5 divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {state.history.map((h) => (
              <div key={h.id} className="flex items-center gap-3 px-3 py-3">
                <span className="w-9 h-9 rounded-xl bg-gold/12 text-gold-dark dark:text-gold-light inline-flex items-center justify-center shrink-0">
                  <Check size={16} strokeWidth={2.6} aria-hidden />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-text-primary dark:text-text-on-dark truncate">{h.title}</span>
                  {h.dedication ? <span className="block text-[11.5px] text-text-muted truncate">{h.dedication}</span> : null}
                </span>
                <span className="text-end shrink-0">
                  <span className="block text-[11.5px] text-text-secondary dark:text-text-on-dark/80">{dateAr(h.completedAt)}</span>
                  <span className="block text-[10.5px] text-text-muted">قرأها {ar(h.readers)}</span>
                </span>
              </div>
            ))}
          </Card>
        </section>
      ) : null}

      <StartKhatmaSheet open={starting} onClose={() => setStarting(false)} groupId={gid} />
    </div>
  );
}

function Running({ k, groupId, isOwner }: { k: Khatma; groupId: string; isOwner: boolean }) {
  const [open, setOpen] = useState<JuzCell | null>(null);
  const [cancel, setCancel] = useState(false);
  const cells = juzCells(k.parts);
  const prog = khatmaProgress(k.parts);
  const mine = k.parts.filter((p) => p.isMe);
  const mineDone = mine.filter((p) => p.done).length;
  const firstFree = cells.find((c) => c.state === 'free');
  const myNext = cells.find((c) => c.state === 'mine');

  return (
    <>
      <Card variant="gradient-edge" className="p-5">
        <ArchMotif className="absolute -top-3 -start-5 w-28 h-36 text-gold opacity-[0.16]" />
        <div className="relative flex items-center gap-4">
          <ProgressRing value={prog.pct} size={92} strokeWidth={8} label="تمّ" colorFrom="var(--color-gold)" colorTo="var(--color-gold-light)" />
          <div className="min-w-0 flex-1">
            <h2 className="text-[19px] font-display font-bold text-text-primary dark:text-text-on-dark text-balance">{k.title}</h2>
            {k.dedication ? <p className="font-ornate text-[15px] text-gold-dark dark:text-gold-light mt-0.5 text-pretty">{k.dedication}</p> : null}
            <p className="mt-1.5 text-[12px] text-text-secondary dark:text-text-on-dark/80">
              قُرئ {ar(prog.done)} · يُقرأ {ar(prog.reading)} · متاح {ar(prog.free)}
            </p>
          </div>
        </div>
        <p className="relative mt-3 text-[12.5px] text-text-secondary dark:text-text-on-dark/85 text-pretty">
          {mine.length
            ? `معك ${juzList(mine.map((p) => p.juz))}${mineDone ? `، قرأت ${ar(mineDone)} منها` : ''}`
            : 'لم تأخذ جزءاً بعد، اختر جزءاً متاحاً من الشبكة.'}
        </p>
        {myNext || firstFree ? (
          <div className="relative mt-4">
            <Button fullWidth leftIcon={myNext ? <Check size={18} /> : <BookOpen size={18} />} onClick={() => setOpen(myNext ?? firstFree!)}>
              {myNext ? `أتممت الجزء ${ar(myNext.juz)}؟` : `أقرأ الجزء ${ar(firstFree!.juz)}`}
            </Button>
          </div>
        ) : null}
      </Card>

      <section className="flex flex-col gap-2.5">
        <SectionTitle title="الأجزاء الثلاثون" subtitle="اضغط جزءاً لتأخذه، أو لتعلّم ما قرأت" />
        <Card className="p-3">
          <ol className="grid grid-cols-5 sm:grid-cols-6 gap-2" aria-label="أجزاء الختمة">
            {cells.map((c) => {
              const who = c.part ? personName(c.part) : '';
              return (
                <li key={c.juz}>
                  <button
                    type="button"
                    onClick={() => setOpen(c)}
                    aria-label={`الجزء ${ar(c.juz)}، ${c.part ? `${STATE_AR[c.state]}${c.part.isMe ? '' : `، مع ${who}`}` : 'متاح'}`}
                    className={[
                      'w-full min-h-[62px] rounded-[var(--radius-inner)] flex flex-col items-center justify-center gap-0.5 px-1 transition-[transform,background-color] duration-200 ease-out-soft active:scale-95 motion-reduce:transition-none',
                      CELL[c.state],
                    ].join(' ')}
                  >
                    <span className="font-counter tabular-nums text-[17px] font-bold leading-none inline-flex items-center gap-0.5">
                      {c.state === 'done' || c.state === 'mineDone' ? <Check size={12} strokeWidth={3} aria-hidden /> : null}
                      {ar(c.juz)}
                    </span>
                    <span className={['max-w-full truncate text-[10px] leading-tight', c.state === 'free' ? 'text-text-muted' : 'opacity-90'].join(' ')}>
                      {c.part ? (c.part.isMe ? STATE_AR[c.state] : who) : 'متاح'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-text-muted" aria-label="دليل الألوان">
            {(['free', 'taken', 'mine', 'done'] as const).map((s) => (
              <li key={s} className="inline-flex items-center gap-1.5">
                <span className={['w-3 h-3 rounded', CELL[s]].join(' ')} aria-hidden />
                {s === 'taken' ? 'يقرؤه غيرك' : STATE_AR[s]}
              </li>
            ))}
          </ul>
        </Card>
        {k.canCancel ? (
          <div className="flex justify-center">
            <Button variant="ghost" size="sm" className="!text-danger hover:!bg-danger/10" onClick={() => setCancel(true)}>
              إنهاء الختمة دون إتمامها
            </Button>
          </div>
        ) : null}
      </section>

      <JuzSheet cell={open} khatma={k} groupId={groupId} onClose={() => setOpen(null)} isOwner={isOwner} />
      <ConfirmDialog
        open={cancel}
        title="إنهاء الختمة؟"
        message="تُحذف هذه الختمة وما أُخذ من أجزائها، ولا تدخل في سجل الختمات."
        confirmLabel="إنهاء الختمة"
        confirmVariant="danger"
        onCancel={() => setCancel(false)}
        onConfirm={() => {
          setCancel(false);
          void act('cancel_khatma', { p_khatma: k.id }, groupId);
        }}
      />
    </>
  );
}

/** One juz: take it (or a run of free ones), mark it read, give it back. */
function JuzSheet({ cell, khatma, groupId, onClose, isOwner }: { cell: JuzCell | null; khatma: Khatma; groupId: string; onClose: () => void; isOwner: boolean }) {
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const free = khatmaProgress(khatma.parts).free;
  const picks = cell ? pickFreeJuz(khatma.parts, cell.juz, count) : [];

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
      setCount(1);
      onClose();
    }
  };
  const take = () =>
    run(async () => {
      const r = await act<number[]>('take_juz', { p_khatma: khatma.id, p_juz: picks }, groupId);
      if (!r) return;
      const got = r.data ?? [];
      if (got.length === picks.length) toast.success('تقبّل الله منك', `معك ${juzList(got)}`);
      else if (got.length) toast.info('سبقك غيرك إلى بعضها', `معك ${juzList(got)}`);
      else toast.info('سبقك إليه غيرك، اختر جزءاً آخر');
    });
  const setDone = (done: boolean) =>
    run(async () => {
      const r = await act<boolean>('set_juz_done', { p_khatma: khatma.id, p_juz: cell!.juz, p_done: done }, groupId);
      if (r?.data) toast.success('تمّت الختمة بفضل الله', 'تقبّل الله منكم جميعاً');
      else if (r && done) toast.success('تقبّل الله منك');
    });
  const release = () => run(async () => void (await act('release_juz', { p_khatma: khatma.id, p_juz: cell!.juz }, groupId)));

  const holder = cell?.part ? personName(cell.part) : '';
  return (
    <BottomSheet open={!!cell} onClose={onClose} title={cell ? `الجزء ${ar(cell.juz)}` : undefined}>
      {cell ? (
        <div className="flex flex-col gap-4">
          {cell.state === 'free' ? (
            <>
              <p className="text-sm text-text-secondary dark:text-text-on-dark/85 text-pretty">هذا الجزء متاح. خذه لتقرأه، ويراه الأعضاء معك.</p>
              {free > 1 ? (
                <div className="flex items-center justify-between gap-3 rounded-[var(--radius-inner)] bg-cream-dark/55 dark:bg-dark-surface px-3 py-2">
                  <span className="text-[13px] text-text-secondary dark:text-text-on-dark/85">كم جزءاً تقرأ؟</span>
                  <span className="inline-flex items-center gap-2">
                    <Button variant="icon" aria-label="جزء أقل" disabled={count <= 1} onClick={() => setCount((n) => Math.max(1, n - 1))}>
                      <Minus size={16} />
                    </Button>
                    <span className="font-counter tabular-nums text-lg font-bold w-6 text-center" aria-live="polite">
                      {ar(count)}
                    </span>
                    <Button variant="icon" aria-label="جزء أكثر" disabled={count >= free} onClick={() => setCount((n) => Math.min(free, n + 1))}>
                      <Plus size={16} />
                    </Button>
                  </span>
                </div>
              ) : null}
              {count > 1 ? <p className="text-[12px] text-text-muted -mt-2">{juzList(picks)}</p> : null}
              <Button fullWidth loading={busy} leftIcon={<BookOpen size={18} />} onClick={take}>
                {count > 1 ? 'أقرأ هذه الأجزاء' : 'أقرأ هذا الجزء'}
              </Button>
            </>
          ) : cell.state === 'mine' ? (
            <>
              <p className="text-sm text-text-secondary dark:text-text-on-dark/85 text-pretty">هذا الجزء معك. إذا أتممت قراءته فعلِّمه ليراه الأعضاء.</p>
              <Button fullWidth loading={busy} leftIcon={<Check size={18} />} onClick={() => setDone(true)}>
                قرأته
              </Button>
              <Button variant="secondary" fullWidth disabled={busy} onClick={release}>
                تركه لغيري
              </Button>
            </>
          ) : cell.state === 'mineDone' ? (
            <>
              <p className="text-sm text-text-secondary dark:text-text-on-dark/85">قرأت هذا الجزء، تقبّل الله منك.</p>
              <Button variant="secondary" fullWidth loading={busy} onClick={() => setDone(false)}>
                لم أُتمّه بعد
              </Button>
            </>
          ) : cell.state === 'taken' ? (
            <>
              <p className="text-sm text-text-secondary dark:text-text-on-dark/85">مع {holder}، ولم يُتمّه بعد.</p>
              {isOwner ? (
                <Button variant="soft" fullWidth loading={busy} onClick={release}>
                  إتاحته لغيره
                </Button>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-text-secondary dark:text-text-on-dark/85">قرأه {holder}، تقبّل الله منه.</p>
          )}
        </div>
      ) : null}
    </BottomSheet>
  );
}

function Completed({ k, readers, onNext }: { k: Khatma; readers: number; onNext: () => void }) {
  return (
    <Card variant="gradient-edge" className="p-5">
      <ArchMotif className="absolute -top-3 -start-5 w-28 h-36 text-gold opacity-[0.16]" />
      <div className="relative flex flex-col items-center text-center gap-2">
        <Medallion size={76} tone="gold">
          <Sparkles size={24} className="text-gold-dark dark:text-gold-light" aria-hidden />
        </Medallion>
        <h2 className="text-xl font-display font-bold text-text-primary dark:text-text-on-dark">تمّت الختمة بفضل الله</h2>
        <p className="text-[12.5px] text-text-secondary dark:text-text-on-dark/80">
          {k.title} · {dateAr(k.completedAt!)} · قرأها {ar(readers)}
        </p>
        {k.dedication ? <p className="font-ornate text-[16px] text-gold-dark dark:text-gold-light">{k.dedication}</p> : null}
      </div>
      <div className="relative mt-4 flex flex-col gap-3">
        {completionDuas(k.dedication).map((d) => (
          <figure key={d.source} className="rounded-[var(--radius-inner)] bg-white/70 dark:bg-white/[0.05] ring-1 ring-gold/25 px-4 py-3 text-center">
            <blockquote className={d.quran ? 'font-quran text-[19px] leading-loose text-text-primary dark:text-text-on-dark' : 'text-[15px] leading-relaxed text-text-primary dark:text-text-on-dark'}>
              {d.quran ? `﴿${d.text}﴾` : `«${d.text}»`}
            </blockquote>
            <figcaption className="mt-1 text-[11px] text-text-muted">{d.source}</figcaption>
          </figure>
        ))}
        <p className="text-[11.5px] leading-relaxed text-text-muted text-pretty text-center">
          لم يثبت دعاءٌ مخصوص لختم القرآن، فادعوا بما شئتم من خيري الدنيا والآخرة. و«{ANAS_KHATM.text}» ({ANAS_KHATM.source}).
        </p>
        <Button variant="gold" fullWidth onClick={onNext}>
          ابدأ الختمة التالية
        </Button>
      </div>
    </Card>
  );
}

function StartKhatmaSheet({ open, onClose, groupId }: { open: boolean; onClose: () => void; groupId: string }) {
  const [title, setTitle] = useState('ختمة جماعية');
  const [dedication, setDedication] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = title.trim().length >= 1 && title.trim().length <= 60 && dedication.trim().length <= 120;
  return (
    <BottomSheet open={open} onClose={onClose} title="ختمة جديدة">
      <div className="flex flex-col gap-4">
        <Input label="اسم الختمة" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />
        <div className="flex flex-col gap-2">
          <Input
            label="إهداؤها (اختياري)"
            value={dedication}
            maxLength={120}
            placeholder="على روح … أو لشفاء …"
            onChange={(e) => setDedication(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            {['على روح ', 'لشفاء '].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setDedication(s)}
                className="min-h-9 px-3 rounded-xl bg-teal/10 text-teal dark:bg-teal/15 dark:text-teal-light text-[13px] font-semibold"
              >
                {s.trim()}…
              </button>
            ))}
          </div>
        </div>
        <Button
          fullWidth
          loading={busy}
          disabled={!valid}
          onClick={async () => {
            setBusy(true);
            const r = await act('start_khatma', { p_group: groupId, p_title: title.trim(), p_dedication: dedication.trim() || null }, groupId);
            setBusy(false);
            if (r) {
              toast.success('بدأت الختمة', 'اختر جزءك من الشبكة');
              setDedication('');
              onClose();
            }
          }}
        >
          ابدأ الختمة
        </Button>
      </div>
    </BottomSheet>
  );
}
