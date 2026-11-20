import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { Copy, Crown, EyeOff, LogOut, Pencil, RefreshCw, Share2, Trash2, UserMinus, Users } from 'lucide-react';
import { TopAppBar } from '@/components/layout/TopAppBar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { TextArea } from '@/components/ui/TextInput';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Medallion, SectionTitle } from '@/components/ui/Ornament';
import { nameOf } from '@/components/leaderboard/LeaderboardCards';
import { PersonCrown } from '@/components/crowns/CrownEmblem';
import { GroupKhatma } from '@/components/groups/GroupKhatma';
import { GroupGoal } from '@/components/groups/GroupGoal';
import { toast } from '@/store/toastStore';
import { useAuthStore } from '@/store/authStore';
import {
  act,
  copyText,
  forget,
  loadBoard,
  loadGroup,
  loadGroups,
  shareInvite,
  useGroupsStore,
  type GroupPeriod,
  type GroupState,
  type GroupsStatus,
  type Member,
} from '@/services/groups';
import { membersLabel, personName } from '@/services/groupsLogic';
import { toArabicDigits } from '@/utils/arabicFormat';

const ar = toArabicDigits;
type Tab = 'khatma' | 'goal' | 'board' | 'members';
const TABS: Tab[] = ['khatma', 'goal', 'board', 'members'];
const TAB_LABEL: Record<Tab, string> = { khatma: 'الختمة', goal: 'الذكر', board: 'الترتيب', members: 'الأعضاء' };
const POLL_MS = 60_000;

/** One group: khatma · dhikr goal · in-group ranking · members — polled while open. */
export function GroupDetail({ id }: { id: string }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') as Tab | null;
  const tab: Tab = raw && TABS.includes(raw) ? raw : 'khatma';
  const st = useGroupsStore((s) => s.groups[id]);
  const status = useGroupsStore((s) => s.status);
  const ready = useAuthStore((s) => s.ready);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setBusy(true);
    try {
      await loadGroup(id);
    } finally {
      setBusy(false);
      setLoaded(true);
    }
  };

  useEffect(() => {
    if (!ready) return;
    void refresh();
    // Others take juz and add counts too: re-read every minute while visible, and on return.
    const tick = setInterval(() => document.visibilityState === 'visible' && void loadGroup(id), POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && void loadGroup(id);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh is stable in effect
  }, [id, ready]);

  const actions = (
    <>
      <button
        type="button"
        aria-label="تحديث"
        title="تحديث"
        disabled={busy}
        onClick={() => void refresh()}
        className="w-9 h-9 inline-flex items-center justify-center rounded-full text-teal dark:text-teal-light hover:bg-teal/10 disabled:opacity-70"
      >
        <RefreshCw size={16} className={busy ? 'animate-spin' : ''} aria-hidden />
      </button>
      {st ? (
        <button
          type="button"
          aria-label="مشاركة الدعوة"
          title="مشاركة الدعوة"
          onClick={() => void shareInvite(st.group.name, st.group.code)}
          className="w-9 h-9 inline-flex items-center justify-center rounded-full text-teal dark:text-teal-light hover:bg-teal/10"
        >
          <Share2 size={16} aria-hidden />
        </button>
      ) : null}
    </>
  );

  return (
    <div className="min-h-dvh bg-cream dark:bg-dark-bg" dir="rtl">
      <TopAppBar title={st?.group.name ?? 'المجموعة'} subtitle={st ? membersLabel(st.members.length) : undefined} showBack actions={actions} />
      <div className="flex flex-col gap-6 px-4 pt-4 pb-28 max-w-3xl mx-auto">
        {!st ? (
          status === 'missing' ? (
            <Note text="المجموعات قيد التجهيز، وستعمل حين تُفتح." />
          ) : loaded && status !== 'offline' ? (
            <Card>
              <EmptyState
                illustration={
                  <Medallion size={72} tone="gold">
                    <Users size={24} className="text-gold" />
                  </Medallion>
                }
                title="لست عضواً في هذه المجموعة"
                description="ربما غادرتها أو أزالك مشرفها. يمكنك الانضمام من جديد برمز دعوة."
                cta={{ label: 'مجموعاتي', onClick: () => navigate('/groups', { replace: true }) }}
              />
            </Card>
          ) : loaded ? (
            <Retry onRetry={() => void refresh()} />
          ) : (
            <Card className="p-4 flex flex-col gap-3" aria-busy>
              <Skeleton height={110} rounded="lg" />
              <Skeleton lines={4} />
            </Card>
          )
        ) : (
          <>
            {status === 'offline' ? <OfflineNote onRetry={() => void refresh()} /> : null}
            {st.group.description ? <p className="-mb-2 px-1 text-[13px] text-text-secondary dark:text-text-on-dark/80 text-pretty">{st.group.description}</p> : null}
            <div role="tablist" aria-label="أقسام المجموعة" className="grid grid-cols-4 rounded-2xl bg-cream-dark/60 dark:bg-dark-surface p-1">
              {TABS.map((t) => (
                <button
                  key={t}
                  type="button"
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setParams({ id, tab: t }, { replace: true })}
                  className={[
                    'min-h-10 rounded-xl text-[13px] font-semibold transition-colors',
                    tab === t ? 'bg-white dark:bg-dark-card shadow-[var(--shadow-xs)] text-teal dark:text-teal-light' : 'text-text-muted',
                  ].join(' ')}
                >
                  {TAB_LABEL[t]}
                </button>
              ))}
            </div>
            {st.members.length === 1 && tab !== 'members' ? <Invite st={st} compact /> : null}
            {tab === 'khatma' ? <GroupKhatma state={st} /> : null}
            {tab === 'goal' ? <GroupGoal state={st} /> : null}
            {tab === 'board' ? <Board groupId={id} status={status} /> : null}
            {tab === 'members' ? <Members st={st} /> : null}
          </>
        )}
      </div>
    </div>
  );
}

function Note({ text }: { text: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-text-secondary dark:text-text-on-dark/80 text-pretty">{text}</p>
    </Card>
  );
}

function Retry({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="p-4 flex flex-col items-start gap-3">
      <p className="text-sm text-text-secondary dark:text-text-on-dark/80">تعذّر التحميل، تحقّق من اتصالك بالإنترنت.</p>
      <Button variant="soft" size="sm" leftIcon={<RefreshCw size={14} />} onClick={onRetry}>
        إعادة المحاولة
      </Button>
    </Card>
  );
}

export function OfflineNote({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--radius-inner)] bg-gold/10 ring-1 ring-gold/30 px-3 py-2">
      <p className="text-[12px] text-text-secondary dark:text-text-on-dark/85">تعرض آخر ما حُفظ، تحقّق من اتصالك.</p>
      <Button variant="ghost" size="sm" onClick={onRetry}>
        إعادة
      </Button>
    </div>
  );
}

/** The invite: code (copy) + share; the owner can issue a new code. */
function Invite({ st, compact = false }: { st: GroupState; compact?: boolean }) {
  const [regen, setRegen] = useState(false);
  const { code, name, isOwner } = st.group;
  return (
    <Card variant={compact ? 'gold-rim' : 'plain'} className="p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-bold text-text-primary dark:text-text-on-dark">
            {compact ? 'ادعُ أهلك وأصحابك' : 'رمز الدعوة'}
          </span>
          <span className="block text-[11.5px] text-text-muted text-pretty">
            {compact ? 'أنت وحدك في المجموعة الآن، أرسل إليهم الرمز' : 'من يملك الرمز يستطيع الانضمام'}
          </span>
        </span>
        <button
          type="button"
          onClick={() => void copyText(code, 'نُسخ الرمز')}
          aria-label={`نسخ الرمز ${code.split('').join(' ')}`}
          dir="ltr"
          className="inline-flex items-center gap-2 rounded-xl bg-cream-dark/60 dark:bg-dark-surface px-3 min-h-11 font-counter text-[19px] font-bold tracking-[0.2em] text-teal dark:text-teal-light"
        >
          {code}
          <Copy size={14} className="text-text-muted" aria-hidden />
        </button>
      </div>
      <div className="flex gap-2">
        <Button variant={compact ? 'primary' : 'soft'} size="sm" fullWidth leftIcon={<Share2 size={15} />} onClick={() => void shareInvite(name, code)}>
          مشاركة الدعوة
        </Button>
        {isOwner && !compact ? (
          <Button variant="secondary" size="sm" fullWidth leftIcon={<RefreshCw size={14} />} onClick={() => setRegen(true)}>
            رمز جديد
          </Button>
        ) : null}
      </div>
      <ConfirmDialog
        open={regen}
        title="إصدار رمز جديد؟"
        message="يتوقف الرمز الحالي فلا ينضم به أحد بعد الآن، ويبقى الأعضاء كما هم."
        confirmLabel="رمز جديد"
        onCancel={() => setRegen(false)}
        onConfirm={async () => {
          setRegen(false);
          const r = await act('regenerate_code', { p_group: st.group.id }, st.group.id);
          if (r) toast.success('صدر رمز جديد');
        }}
      />
    </Card>
  );
}

function Board({ groupId, status }: { groupId: string; status: GroupsStatus }) {
  const [period, setPeriod] = useState<GroupPeriod>('today');
  const rows = useGroupsStore((s) => s.boards[`${groupId}|${period}`]);
  const [loading, setLoading] = useState(false);
  const [pushed, setPushed] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let live = true;
    setLoading(true);
    void loadBoard(groupId, period, !pushed).finally(() => {
      if (!live) return;
      setLoading(false);
      setPushed(true);
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- push our points once per visit
  }, [groupId, period]);

  return (
    <section className="flex flex-col gap-3">
      <div role="tablist" aria-label="فترة الترتيب" className="grid grid-cols-3 rounded-2xl bg-cream-dark/60 dark:bg-dark-surface p-1">
        {(['today', 'week', 'month'] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            aria-selected={period === p}
            onClick={() => setPeriod(p)}
            className={[
              'min-h-9 rounded-xl text-[12.5px] font-semibold transition-colors',
              period === p ? 'bg-white dark:bg-dark-card shadow-[var(--shadow-xs)] text-teal dark:text-teal-light' : 'text-text-muted',
            ].join(' ')}
          >
            {p === 'today' ? 'اليوم' : p === 'week' ? 'الأسبوع' : 'الشهر'}
          </button>
        ))}
      </div>
      <SectionTitle title="ترتيب المجموعة" subtitle="بنقاط «الترتيب» نفسها" />
      {!rows ? (
        loading ? (
          <Card className="p-3 flex flex-col gap-3" aria-busy>
            <Skeleton lines={5} height={18} />
          </Card>
        ) : (
          <Retry onRetry={() => void loadBoard(groupId, period)} />
        )
      ) : (
        <Card className="p-1.5 divide-y divide-black/[0.05] dark:divide-white/[0.06]">
          {rows.map((r, i) => (
            <div
              key={`${r.rank}-${r.tag}-${i}`}
              className={['flex items-center gap-3 px-3 py-3 rounded-[var(--radius-inner)]', r.isMe ? 'bg-gold/10 ring-1 ring-gold/35' : ''].join(' ')}
            >
              <span
                className={[
                  'w-9 h-9 rounded-xl inline-flex items-center justify-center font-counter font-bold tabular-nums text-[13px] shrink-0',
                  r.rank === 1 && r.points > 0 ? 'bg-[image:var(--gradient-gold)] text-[#2a1d05]' : 'bg-teal/10 text-teal dark:text-teal-light',
                ].join(' ')}
              >
                {r.rank === 1 && r.points > 0 ? <Crown size={15} aria-label="الأول" /> : ar(r.rank)}
              </span>
              <span className="flex-1 min-w-0 flex items-center gap-1.5 text-[15px] font-semibold text-text-primary dark:text-text-on-dark">
                <span className="truncate">{nameOf(r)}</span>
                {!r.name && !r.isMe ? <EyeOff size={12} className="text-text-muted shrink-0" aria-label="اسم مخفي" /> : null}
                {/* The global «الترتيب» crowns (same tag + name as the public board). */}
                <PersonCrown who={r} size={17} />
              </span>
              <span className="font-counter tabular-nums text-[16.5px] font-bold text-gold-dark dark:text-gold-light">{ar(r.points)}</span>
            </div>
          ))}
        </Card>
      )}
      {status === 'away' ? null : (
        <p className="text-center text-[11.5px] leading-relaxed text-text-muted text-pretty px-2">
          من أوقف المشاركة في «الترتيب» يظهر هنا بلا نقاط.{' '}
          <button type="button" onClick={() => navigate('/leaderboard')} className="font-semibold text-teal dark:text-teal-light underline-offset-2 hover:underline">
            كيف تُحتسب النقاط؟
          </button>
        </p>
      )}
    </section>
  );
}

function Members({ st }: { st: GroupState }) {
  const navigate = useNavigate();
  const [removing, setRemoving] = useState<Member | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const { id, isOwner } = st.group;
  const alone = st.members.length === 1;

  const leave = async (fn: 'leave_group' | 'delete_group') => {
    const r = await act(fn, { p_group: id });
    if (!r) return;
    forget(id);
    toast.success(fn === 'leave_group' ? 'غادرت المجموعة' : 'حُذفت المجموعة');
    navigate('/groups', { replace: true });
    void loadGroups();
  };

  return (
    <div className="flex flex-col gap-6">
      <Invite st={st} />
      <section className="flex flex-col gap-2.5">
        <SectionTitle
          title="الأعضاء"
          subtitle={`${membersLabel(st.members.length)} من ${ar(50)}`}
          action={
            isOwner ? (
              <Button variant="ghost" size="sm" leftIcon={<Pencil size={14} />} onClick={() => setEditing(true)}>
                تعديل
              </Button>
            ) : null
          }
        />
        <Card className="p-1.5 divide-y divide-black/[0.05] dark:divide-white/[0.06]">
          {st.members.map((m) => (
            <div key={m.no} className="flex items-center gap-3 px-3 py-2.5">
              <span
                className={[
                  'w-9 h-9 rounded-xl inline-flex items-center justify-center shrink-0 text-[14px] font-bold',
                  m.isOwner ? 'bg-gold/15 text-gold-dark dark:text-gold-light' : 'bg-teal/10 text-teal dark:text-teal-light',
                ].join(' ')}
                aria-hidden
              >
                {m.isOwner ? <Crown size={15} /> : m.name ? m.name.trim().charAt(0) : <EyeOff size={14} />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block truncate text-sm font-semibold text-text-primary dark:text-text-on-dark">{personName(m)}</span>
                <span className="block text-[11px] text-text-muted">{m.isOwner ? 'مشرف المجموعة' : 'عضو'}</span>
              </span>
              {isOwner && !m.isMe ? (
                <Button variant="icon" aria-label={`إزالة ${personName(m)}`} onClick={() => setRemoving(m)} className="!text-danger hover:!bg-danger/10">
                  <UserMinus size={17} />
                </Button>
              ) : null}
            </div>
          ))}
        </Card>
        <p className="px-1 text-[11.5px] text-text-muted text-pretty">
          تظهر الأسماء كما في «الترتيب»، ومن أخفى اسمه يظهر «مجهولاً».
        </p>
      </section>

      <div className="flex flex-col gap-2">
        <Button variant="secondary" fullWidth leftIcon={<LogOut size={16} />} onClick={() => setLeaving(true)}>
          مغادرة المجموعة
        </Button>
        {isOwner ? (
          <Button variant="ghost" fullWidth leftIcon={<Trash2 size={16} />} className="!text-danger hover:!bg-danger/10" onClick={() => setDeleting(true)}>
            حذف المجموعة
          </Button>
        ) : null}
      </div>

      <ConfirmDialog
        open={!!removing}
        title="إزالة العضو؟"
        message={removing ? `تُزال «${personName(removing)}» من المجموعة، وتعود أجزاؤه التي لم يقرأها متاحةً.` : undefined}
        confirmLabel="إزالة"
        confirmVariant="danger"
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          const m = removing!;
          setRemoving(null);
          const r = await act('remove_member', { p_group: id, p_member: m.no }, id);
          if (r) toast.success('أُزيل العضو');
        }}
      />
      <ConfirmDialog
        open={leaving}
        title="مغادرة المجموعة؟"
        message={
          isOwner && alone
            ? 'أنت آخر أعضائها، فستُحذف المجموعة بختماتها وأهدافها.'
            : isOwner
              ? 'ينتقل الإشراف إلى أقدم الأعضاء، وتعود أجزاؤك التي لم تقرأها متاحةً.'
              : 'تعود أجزاؤك التي لم تقرأها متاحةً، ويمكنك العودة برمز الدعوة.'
        }
        confirmLabel="مغادرة"
        confirmVariant="danger"
        onCancel={() => setLeaving(false)}
        onConfirm={() => {
          setLeaving(false);
          void leave('leave_group');
        }}
      />
      <ConfirmDialog
        open={deleting}
        title="حذف المجموعة؟"
        message="تُحذف المجموعة لجميع أعضائها بختماتها وأهدافها، ولا يمكن التراجع."
        confirmLabel="حذف"
        confirmVariant="danger"
        onCancel={() => setDeleting(false)}
        onConfirm={() => {
          setDeleting(false);
          void leave('delete_group');
        }}
      />
      <EditSheet open={editing} onClose={() => setEditing(false)} st={st} />
    </div>
  );
}

function EditSheet({ open, onClose, st }: { open: boolean; onClose: () => void; st: GroupState }) {
  const [name, setName] = useState(st.group.name);
  const [desc, setDesc] = useState(st.group.description ?? '');
  const [busy, setBusy] = useState(false);
  const valid = name.trim().length >= 1 && name.trim().length <= 40 && desc.trim().length <= 160;
  return (
    <BottomSheet open={open} onClose={onClose} title="تعديل المجموعة">
      <div className="flex flex-col gap-4">
        <Input label="الاسم" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text-secondary dark:text-text-on-dark/80">الوصف (اختياري)</span>
          <TextArea
            value={desc}
            onValueChange={setDesc}
            maxLength={160}
            rows={3}
            className="w-full rounded-[var(--radius-btn)] border border-teal/20 dark:border-dark-border px-4 py-2.5 text-base bg-white dark:bg-dark-card text-text-primary dark:text-text-on-dark focus:outline-none focus:ring-2 focus:ring-teal resize-none"
          />
        </label>
        <Button
          fullWidth
          loading={busy}
          disabled={!valid}
          onClick={async () => {
            setBusy(true);
            const r = await act('rename_group', { p_group: st.group.id, p_name: name.trim(), p_description: desc.trim() || null }, st.group.id);
            setBusy(false);
            if (r) {
              toast.success('حُفظ التعديل');
              void loadGroups();
              onClose();
            }
          }}
        >
          حفظ
        </Button>
      </div>
    </BottomSheet>
  );
}
