import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { BookOpen, ChevronLeft, Crown, KeyRound, Plus, RefreshCw, Users } from 'lucide-react';
import { TopAppBar } from '@/components/layout/TopAppBar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { TextArea } from '@/components/ui/TextInput';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ArchMotif, Medallion, SectionTitle } from '@/components/ui/Ornament';
import { GroupDetail, OfflineNote } from '@/components/groups/GroupDetail';
import { toast } from '@/store/toastStore';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { isSupabaseConfigured } from '@/services/supabaseClient';
import { act, loadGroups, useGroupsStore } from '@/services/groups';
import { extractCode, membersLabel } from '@/services/groupsLogic';
import { toArabicDigits } from '@/utils/arabicFormat';

const ar = toArabicDigits;

/**
 * «المجموعات» — /groups: my groups, create, join by code (`?join=CODE` opens
 * the join sheet filled in); `?id=` is one group (GroupDetail). Same identity
 * as «الترتيب» (no account needed).
 */
export function GroupsPage() {
  const [params] = useSearchParams();
  const id = params.get('id');
  if (id) return <GroupDetail key={id} id={id} />;
  return <GroupsList />;
}

function GroupsList() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const joinParam = params.get('join');
  const list = useGroupsStore((s) => s.list);
  const status = useGroupsStore((s) => s.status);
  const ready = useAuthStore((s) => s.ready);
  const lbJoin = useSettingsStore((s) => s.leaderboardJoin);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  // An invite link (`?join=CODE`) opens the join sheet filled in — also when it arrives while the page is open.
  useEffect(() => {
    if (joinParam) setJoining(extractCode(joinParam) ?? joinParam);
  }, [joinParam]);

  const refresh = async () => {
    setBusy(true);
    try {
      await loadGroups();
    } finally {
      setBusy(false);
      setTried(true);
    }
  };
  useEffect(() => {
    if (ready) void refresh();
  }, [ready, lbJoin]);

  const closeJoin = () => {
    setJoining(null);
    if (joinParam) setParams({}, { replace: true });
  };
  const open = (gid: string) => navigate(`/groups?id=${gid}`);

  if (!isSupabaseConfigured) {
    return (
      <Shell>
        <Card className="p-4">
          <p className="text-sm text-text-secondary dark:text-text-on-dark/80">المجموعات غير متاحة في هذه النسخة.</p>
        </Card>
      </Shell>
    );
  }

  return (
    <Shell
      actions={
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
      }
    >
      <Card variant="gradient-edge" className="p-5">
        <ArchMotif className="absolute -top-3 -start-5 w-28 h-36 text-gold opacity-[0.16]" />
        <p className="relative font-quran text-[19px] leading-loose text-center text-gold-dark dark:text-gold-light">
          ﴿وَتَعَاوَنُوا عَلَى الْبِرِّ وَالتَّقْوَىٰ﴾
        </p>
        <p className="relative mt-1 text-[13px] leading-relaxed text-center text-text-secondary dark:text-text-on-dark/85 text-pretty">
          مجموعة لأهلك أو أصحابك: ختمةٌ تتقاسمونها، وذكرٌ تجتمعون عليه، وترتيبٌ بينكم.
        </p>
        <div className="relative mt-4 grid grid-cols-2 gap-2">
          <Button leftIcon={<Plus size={18} />} onClick={() => setCreating(true)} disabled={status === 'away' || status === 'missing'}>
            إنشاء مجموعة
          </Button>
          <Button variant="secondary" leftIcon={<KeyRound size={16} />} onClick={() => setJoining('')} disabled={status === 'away' || status === 'missing'}>
            الانضمام برمز
          </Button>
        </div>
      </Card>

      {status === 'missing' ? (
        <Card className="p-4">
          <p className="text-sm text-text-secondary dark:text-text-on-dark/80 text-pretty">المجموعات قيد التجهيز، وستعمل حين تُفتح.</p>
        </Card>
      ) : status === 'away' ? (
        <Away />
      ) : status === 'offline' && list ? (
        <OfflineNote onRetry={() => void refresh()} />
      ) : null}

      {list?.length ? (
        <section className="flex flex-col gap-2.5">
          <SectionTitle title="مجموعاتك" subtitle={`${ar(list.length)} من ${ar(20)}`} />
          <Card className="p-1.5 divide-y divide-black/[0.05] dark:divide-white/[0.06]">
            {list.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => open(g.id)}
                className="w-full text-start flex items-center gap-3 px-3 py-3 rounded-[var(--radius-inner)] hover:bg-teal/5 transition-colors"
              >
                <span className="w-10 h-10 rounded-xl bg-teal/10 text-teal dark:text-teal-light inline-flex items-center justify-center shrink-0">
                  <Users size={18} aria-hidden />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[14.5px] font-bold text-text-primary dark:text-text-on-dark">{g.name}</span>
                    {g.isOwner ? <Crown size={13} className="text-gold shrink-0" aria-label="أنت المشرف" /> : null}
                  </span>
                  <span className="block text-[11.5px] text-text-muted truncate">
                    {membersLabel(g.members)}
                    {' · '}
                    {g.khatmaOpen ? `الختمة ${ar(g.khatmaDone)} من ${ar(30)}` : 'لا ختمة جارية'}
                  </span>
                </span>
                {g.khatmaOpen ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-gold-dark dark:text-gold-light shrink-0">
                    <BookOpen size={13} aria-hidden />
                    {ar(Math.round((g.khatmaDone / 30) * 100))}٪
                  </span>
                ) : null}
                <ChevronLeft size={16} className="text-text-muted shrink-0" aria-hidden />
              </button>
            ))}
          </Card>
        </section>
      ) : list && list.length === 0 && status === 'ok' ? (
        <Card>
          <EmptyState
            illustration={
              <Medallion size={72} tone="gold">
                <Users size={24} className="text-gold" />
              </Medallion>
            }
            title="لا مجموعات بعد"
            description="أنشئ مجموعة وادعُ إليها برمزٍ قصير، أو انضمّ برمزٍ وصلك."
            cta={{ label: 'إنشاء مجموعة', onClick: () => setCreating(true) }}
          />
        </Card>
      ) : !list && (!tried || busy) && status !== 'away' && status !== 'missing' ? (
        <Card className="p-3 flex flex-col gap-3" aria-busy>
          <Skeleton height={56} rounded="lg" />
          <Skeleton height={56} rounded="lg" />
        </Card>
      ) : !list && status === 'offline' ? (
        <Card className="p-4 flex flex-col items-start gap-3">
          <p className="text-sm text-text-secondary dark:text-text-on-dark/80">تعذّر تحميل مجموعاتك، تحقّق من اتصالك بالإنترنت.</p>
          <Button variant="soft" size="sm" leftIcon={<RefreshCw size={14} />} onClick={() => void refresh()}>
            إعادة المحاولة
          </Button>
        </Card>
      ) : null}

      <p className="text-center text-[11.5px] leading-relaxed text-text-muted text-pretty px-2">
        لا يرى أعضاء المجموعة إلا اسمك في «الترتيب» ومجموع نقاطك، ومن أخفى اسمه ظهر «مجهولاً». حتى ٥٠ عضواً في المجموعة.
      </p>

      <CreateSheet open={creating} onClose={() => setCreating(false)} onDone={open} />
      <JoinSheet code={joining} onClose={closeJoin} onDone={open} />
    </Shell>
  );
}

function Shell({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="min-h-dvh bg-cream dark:bg-dark-bg" dir="rtl">
      <TopAppBar title="المجموعات" subtitle="ختمة وذكر وتنافس مع أهلك وصحبك" showBack actions={actions} />
      <div className="flex flex-col gap-6 px-4 pt-4 pb-28 max-w-3xl mx-auto">{children}</div>
    </div>
  );
}

/** A guest who left «الترتيب» has no identity for groups (they share it). */
function Away() {
  const setJoin = useSettingsStore((s) => s.setLeaderboardJoin);
  const navigate = useNavigate();
  return (
    <Card className="p-4 flex flex-col gap-3">
      <p className="text-sm text-text-primary dark:text-text-on-dark leading-relaxed text-pretty">
        تعمل المجموعات بهويّتك في «الترتيب»، وقد أوقفت المشاركة فيه. شارك فيه من جديد، أو سجّل الدخول بحسابك.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="soft" onClick={() => setJoin(true)}>
          المشاركة في الترتيب
        </Button>
        <Button variant="secondary" onClick={() => navigate('/settings')}>
          تسجيل الدخول
        </Button>
      </div>
    </Card>
  );
}

const FIELD =
  'w-full rounded-[var(--radius-btn)] border border-teal/20 dark:border-dark-border px-4 py-2.5 text-base bg-white dark:bg-dark-card text-text-primary dark:text-text-on-dark placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-teal';

function CreateSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (id: string) => void }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = name.trim().length >= 1 && name.trim().length <= 40 && desc.trim().length <= 160;
  return (
    <BottomSheet open={open} onClose={onClose} title="مجموعة جديدة">
      <div className="flex flex-col gap-4">
        <Input label="اسم المجموعة" value={name} maxLength={40} placeholder="مثل: عائلة أبي أحمد" onChange={(e) => setName(e.target.value)} />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text-secondary dark:text-text-on-dark/80">الوصف (اختياري)</span>
          <TextArea value={desc} onValueChange={setDesc} maxLength={160} rows={2} placeholder="نتواصى بالقرآن والذكر" className={`${FIELD} resize-none`} />
        </label>
        <Button
          fullWidth
          loading={busy}
          disabled={!valid}
          onClick={async () => {
            setBusy(true);
            const r = await act<{ id: string; code: string }>('create_group', { p_name: name.trim(), p_description: desc.trim() || null });
            setBusy(false);
            if (!r?.data?.id) return;
            toast.success('أُنشئت المجموعة', 'ادعُ إليها برمز الدعوة');
            setName('');
            setDesc('');
            onClose();
            void loadGroups();
            onDone(r.data.id);
          }}
        >
          إنشاء
        </Button>
      </div>
    </BottomSheet>
  );
}

/** `code` null = closed; '' = open empty; anything else = prefilled (from `?join=`). */
function JoinSheet({ code, onClose, onDone }: { code: string | null; onClose: () => void; onDone: (id: string) => void }) {
  const [text, setText] = useState(code ?? '');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (code !== null) setText(code);
  }, [code]);
  const parsed = extractCode(text);
  return (
    <BottomSheet open={code !== null} onClose={onClose} title="الانضمام إلى مجموعة">
      <div className="flex flex-col gap-4">
        <Input
          label="رمز الدعوة"
          value={text}
          dir="ltr"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          placeholder="K7P2QX"
          hint="ستة أحرف وأرقام، أو ألصق رسالة الدعوة كما هي"
          className="font-counter text-center text-lg tracking-[0.2em]"
          onChange={(e) => setText(e.target.value)}
        />
        <Button
          fullWidth
          loading={busy}
          disabled={!parsed}
          onClick={async () => {
            setBusy(true);
            const r = await act<{ id: string; name: string }>('join_group', { p_code: parsed });
            setBusy(false);
            if (!r?.data?.id) return;
            toast.success('انضممت إلى المجموعة', r.data.name ? `«${r.data.name}»` : undefined);
            setText('');
            onClose();
            void loadGroups();
            onDone(r.data.id);
          }}
        >
          {parsed ? `انضمام بالرمز ${parsed}` : 'انضمام'}
        </Button>
      </div>
    </BottomSheet>
  );
}
