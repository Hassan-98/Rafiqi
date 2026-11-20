import { useState } from 'react';
import { CalendarClock, HandHeart, Plus, Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { NumberInput } from '@/components/ui/NumberInput';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { ArchMotif, Medallion, SectionTitle } from '@/components/ui/Ornament';
import { toast } from '@/store/toastStore';
import { act, type Goal, type GroupState } from '@/services/groups';
import { comingFriday, daysLeft, deadlineLabel, goalProgress, MAX_ADD, MAX_TARGET, num, personName } from '@/services/groupsLogic';
import { dateKeyOf, shortDateAr } from '@/services/statsService';
import { toArabicDigits } from '@/utils/arabicFormat';

const ar = toArabicDigits;
const PRESETS = ['اللهم صلّ على محمد', 'سبحان الله وبحمده', 'أستغفر الله', 'لا إله إلا الله'];
const TARGETS = [1000, 10_000, 100_000];
const ADDS = [33, 100, 500, 1000];
const CHIP = 'min-h-9 px-3 rounded-xl text-[13px] font-semibold transition-colors';
const chip = (on: boolean) =>
  [CHIP, on ? 'bg-[image:var(--gradient-teal)] text-on-accent' : 'bg-teal/10 text-teal dark:bg-teal/15 dark:text-teal-light'].join(' ');

/** «هدف الذكر الجماعي»: one shared counter at a time — progress, my count, the top contributors. */
export function GroupGoal({ state }: { state: GroupState }) {
  const g = state.goal;
  const [starting, setStarting] = useState(false);
  const gid = state.group.id;
  return (
    <div className="flex flex-col gap-6">
      {g ? (
        <GoalView g={g} groupId={gid} onNew={() => setStarting(true)} />
      ) : (
        <Card className="p-2">
          <div className="flex flex-col items-center text-center gap-3 px-4 py-8">
            <Medallion size={72} tone="gold">
              <HandHeart size={24} className="text-gold-dark dark:text-gold-light" aria-hidden />
            </Medallion>
            <h3 className="text-lg font-display font-bold text-text-primary dark:text-text-on-dark">لا هدف جارٍ</h3>
            <p className="text-sm text-text-muted max-w-xs leading-relaxed text-pretty">
              اجتمعوا على ذكرٍ واحد بعددٍ تبلغونه معاً، كعشرة آلاف صلاةٍ على النبي ﷺ يوم الجمعة.
            </p>
            <Button onClick={() => setStarting(true)}>هدف جديد</Button>
          </div>
        </Card>
      )}
      <StartGoalSheet open={starting} onClose={() => setStarting(false)} groupId={gid} />
    </div>
  );
}

function GoalView({ g, groupId, onNew }: { g: Goal; groupId: string; onNew: () => void }) {
  const [adding, setAdding] = useState(false);
  const [closing, setClosing] = useState(false);
  const p = goalProgress(g.total, g.target);
  const days = g.deadline ? daysLeft(g.deadline, dateKeyOf(new Date())) : null;
  const ended = g.closed || (days !== null && days < 0);
  const canAdd = !ended;

  return (
    <>
      <Card variant="gradient-edge" className="p-5">
        <ArchMotif className="absolute -top-3 -start-5 w-28 h-36 text-gold opacity-[0.16]" />
        <div className="relative flex items-center gap-4">
          <ProgressRing value={p.pct} size={100} strokeWidth={9} colorFrom="var(--color-gold)" colorTo="var(--color-gold-light)" />
          <div className="min-w-0 flex-1">
            <h2 className="font-ornate text-[21px] leading-snug text-text-primary dark:text-text-on-dark text-balance">{g.title}</h2>
            <p className="mt-1 font-counter tabular-nums text-[15px] font-bold text-gold-dark dark:text-gold-light">
              {num(g.total)} <span className="text-[12px] font-semibold text-text-muted">من {num(g.target)}</span>
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-text-secondary dark:text-text-on-dark/80">
              {p.reached ? <span>بلغتم الهدف</span> : <span>باقٍ {num(p.left)}</span>}
              {g.deadline ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-gold/12 ring-1 ring-gold/30 px-2 min-h-6 text-gold-dark dark:text-gold-light">
                  <CalendarClock size={12} aria-hidden />
                  {g.closed ? shortDateAr(g.deadline) : deadlineLabel(days!)}
                </span>
              ) : null}
            </p>
          </div>
        </div>
        <p className="relative mt-3 text-[12.5px] text-text-secondary dark:text-text-on-dark/85">
          {g.mine ? `مساهمتك ${num(g.mine)}، تقبّل الله منك` : canAdd ? 'لم تُضف شيئاً بعد، شارك ولو بقليل' : 'لم تشارك في هذا الهدف'}
        </p>
        <div className="relative mt-4 flex flex-col gap-2">
          {canAdd ? (
            <Button fullWidth leftIcon={<Plus size={18} />} onClick={() => setAdding(true)}>
              أضف ذكرك
            </Button>
          ) : null}
          {p.reached || ended ? (
            <Button variant={canAdd ? 'secondary' : 'gold'} fullWidth leftIcon={<Sparkles size={16} />} onClick={onNew}>
              هدف جديد
            </Button>
          ) : null}
        </div>
      </Card>

      {p.reached ? (
        <p className="text-center text-[12.5px] text-text-secondary dark:text-text-on-dark/85 text-pretty px-2">
          بلغتم ما اجتمعتم عليه، تقبّل الله منكم. ﴿وَالذَّاكِرِينَ اللَّهَ كَثِيرًا وَالذَّاكِرَاتِ أَعَدَّ اللَّهُ لَهُم مَّغْفِرَةً وَأَجْرًا عَظِيمًا﴾
        </p>
      ) : null}

      <section className="flex flex-col gap-2.5">
        <SectionTitle title="الأكثر ذكراً" subtitle={g.contributors ? `${ar(g.contributors)} من الأعضاء شاركوا` : 'كن أول المشاركين'} />
        {g.top.length ? (
          <Card className="p-1.5 divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {g.top.map((t, i) => (
              <div
                key={`${t.tag}-${i}`}
                className={['flex items-center gap-3 px-3 py-3 rounded-[var(--radius-inner)]', t.isMe ? 'bg-gold/10 ring-1 ring-gold/35' : ''].join(' ')}
              >
                <span className="w-9 h-9 rounded-xl bg-teal/10 text-teal dark:text-teal-light inline-flex items-center justify-center font-counter font-bold tabular-nums text-[13px] shrink-0">
                  {ar(i + 1)}
                </span>
                <span className="flex-1 min-w-0 truncate text-sm font-semibold text-text-primary dark:text-text-on-dark">{personName(t)}</span>
                <span className="font-counter tabular-nums text-[14px] font-bold text-gold-dark dark:text-gold-light">{num(t.count)}</span>
              </div>
            ))}
          </Card>
        ) : (
          <Card className="p-4">
            <p className="text-sm text-text-muted text-pretty">لم يُضف أحدٌ شيئاً بعد.</p>
          </Card>
        )}
        {g.canClose ? (
          <div className="flex justify-center">
            <Button variant="ghost" size="sm" className="!text-danger hover:!bg-danger/10" onClick={() => setClosing(true)}>
              إنهاء الهدف
            </Button>
          </div>
        ) : null}
      </section>

      <AddSheet open={adding} onClose={() => setAdding(false)} g={g} groupId={groupId} />
      <ConfirmDialog
        open={closing}
        title="إنهاء الهدف؟"
        message="يتوقف العدّ عند ما بلغتموه، ويمكن بعدها بدء هدف جديد."
        confirmLabel="إنهاء الهدف"
        confirmVariant="danger"
        onCancel={() => setClosing(false)}
        onConfirm={() => {
          setClosing(false);
          void act('close_goal', { p_goal: g.id }, groupId);
        }}
      />
    </>
  );
}

function AddSheet({ open, onClose, g, groupId }: { open: boolean; onClose: () => void; g: Goal; groupId: string }) {
  const [n, setN] = useState(100);
  const [busy, setBusy] = useState(false);
  const valid = Number.isInteger(n) && n >= 1 && n <= MAX_ADD;
  return (
    <BottomSheet open={open} onClose={onClose} title="أضف ذكرك">
      <div className="flex flex-col gap-4">
        <p className="font-ornate text-[18px] text-center text-text-primary dark:text-text-on-dark">{g.title}</p>
        <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="أعداد جاهزة">
          {ADDS.map((a) => (
            <button key={a} type="button" aria-pressed={n === a} onClick={() => setN(a)} className={chip(n === a)}>
              {num(a)}
            </button>
          ))}
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text-secondary dark:text-text-on-dark/80">العدد</span>
          <NumberInput
            value={n}
            onValueChange={setN}
            min={1}
            max={MAX_ADD}
            className="w-full rounded-[var(--radius-btn)] border border-teal/20 dark:border-dark-border px-4 py-2.5 text-base bg-white dark:bg-dark-card text-text-primary dark:text-text-on-dark font-counter tabular-nums text-center focus:outline-none focus:ring-2 focus:ring-teal"
          />
          <span className="text-[11px] text-text-muted">حتى {num(MAX_ADD)} في المرة الواحدة</span>
        </label>
        <Button
          fullWidth
          loading={busy}
          disabled={!valid}
          onClick={async () => {
            setBusy(true);
            const before = goalProgress(g.total, g.target).reached;
            const r = await act<number>('add_goal_count', { p_goal: g.id, p_count: n }, groupId);
            setBusy(false);
            if (!r) return;
            const total = Number(r.data);
            if (!before && total >= g.target) toast.success('بلغتم الهدف بفضل الله', 'تقبّل الله منكم جميعاً');
            else toast.success('تقبّل الله منك', `أُضيف ${num(n)}`);
            onClose();
          }}
        >
          {valid ? `أضف ${num(n)}` : 'أضف'}
        </Button>
      </div>
    </BottomSheet>
  );
}

type DeadlineMode = 'none' | 'friday' | 'date';

function StartGoalSheet({ open, onClose, groupId }: { open: boolean; onClose: () => void; groupId: string }) {
  const [title, setTitle] = useState(PRESETS[0]);
  const [target, setTarget] = useState(10_000);
  const [mode, setMode] = useState<DeadlineMode>('friday');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const today = dateKeyOf(new Date());
  const friday = comingFriday(new Date());
  const deadline = mode === 'friday' ? friday : mode === 'date' ? date || null : null;
  const valid =
    title.trim().length >= 1 &&
    title.trim().length <= 80 &&
    Number.isInteger(target) &&
    target >= 1 &&
    target <= MAX_TARGET &&
    (mode !== 'date' || (!!date && date >= today));

  return (
    <BottomSheet open={open} onClose={onClose} title="هدف ذكر جديد">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Input label="الذكر" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button key={p} type="button" aria-pressed={title === p} onClick={() => setTitle(p)} className={chip(title === p)}>
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text-secondary dark:text-text-on-dark/80">العدد المطلوب من المجموعة</span>
            <NumberInput
              value={target}
              onValueChange={setTarget}
              min={1}
              max={MAX_TARGET}
              className="w-full rounded-[var(--radius-btn)] border border-teal/20 dark:border-dark-border px-4 py-2.5 text-base bg-white dark:bg-dark-card text-text-primary dark:text-text-on-dark font-counter tabular-nums focus:outline-none focus:ring-2 focus:ring-teal"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {TARGETS.map((t) => (
              <button key={t} type="button" aria-pressed={target === t} onClick={() => setTarget(t)} className={chip(target === t)}>
                {num(t)}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text-secondary dark:text-text-on-dark/80">الموعد</span>
          <div className="flex flex-wrap gap-2" role="group" aria-label="الموعد">
            <button type="button" aria-pressed={mode === 'friday'} onClick={() => setMode('friday')} className={chip(mode === 'friday')}>
              {friday === today ? 'اليوم الجمعة' : `الجمعة ${shortDateAr(friday)}`}
            </button>
            <button type="button" aria-pressed={mode === 'date'} onClick={() => setMode('date')} className={chip(mode === 'date')}>
              تاريخ آخر
            </button>
            <button type="button" aria-pressed={mode === 'none'} onClick={() => setMode('none')} className={chip(mode === 'none')}>
              بلا موعد
            </button>
          </div>
          {mode === 'date' ? (
            <input
              type="date"
              value={date}
              min={today}
              aria-label="تاريخ انتهاء الهدف"
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-[var(--radius-btn)] border border-teal/20 dark:border-dark-border px-4 py-2.5 text-base bg-white dark:bg-dark-card text-text-primary dark:text-text-on-dark focus:outline-none focus:ring-2 focus:ring-teal"
            />
          ) : null}
        </div>
        <Button
          fullWidth
          loading={busy}
          disabled={!valid}
          onClick={async () => {
            setBusy(true);
            const r = await act('start_goal', { p_group: groupId, p_title: title.trim(), p_target: target, p_deadline: deadline }, groupId);
            setBusy(false);
            if (r) {
              toast.success('بدأ الهدف', `${num(target)} ${title.trim()}`);
              onClose();
            }
          }}
        >
          ابدأ الهدف
        </Button>
      </div>
    </BottomSheet>
  );
}
