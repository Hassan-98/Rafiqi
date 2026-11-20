import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { Bell, Lock, UserPlus } from 'lucide-react';
import { TopAppBar } from '@/components/layout/TopAppBar';
import { Button } from '@/components/ui/Button';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { EmptyState } from '@/components/ui/EmptyState';
import { Toggle } from '@/components/ui/Toggle';
import { Field, Segmented, fieldClass } from '@/components/study/studyUi';
import { SilatHome } from '@/components/silat/SilatHome';
import { ParentsView } from '@/components/silat/ParentsView';
import { InsightsView } from '@/components/silat/InsightsView';
import { PersonDetail } from '@/components/silat/PersonDetail';
import { PersonFormSheet } from '@/components/silat/PersonFormSheet';
import { LogSheet } from '@/components/silat/LogSheet';
import { TemplatesSheet } from '@/components/silat/TemplatesSheet';
import { Onboarding } from '@/components/silat/Onboarding';
import { useSilatStore } from '@/store/silatStore';
import { rescheduleAllSilat } from '@/services/silatReminders';
import { CallAutoLogSetting } from '@/components/silat/CallAutoLogSetting';
import type { ContactType } from '@/data/silatContent';
import type { Person } from '@/store/silatModel';

type Tab = 'home' | 'parents' | 'insights';
const TABS: Tab[] = ['home', 'parents', 'insights'];

function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const prefs = useSilatStore((s) => s.prefs);
  const setPrefs = useSilatStore((s) => s.setPrefs);
  return (
    <BottomSheet open={open} onClose={onClose} title="تذكيرات الصلة">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[14px] font-semibold text-text-primary dark:text-text-on-dark">تذكير يومي بمن حان موعد صلتهم</span>
            <Toggle checked={prefs.digest} onChange={(v) => setPrefs({ digest: v })} label="تذكير يومي" hideLabel />
          </div>
          {prefs.digest ? (
            <Field label="وقته" hint="إشعار واحد بالأسماء، ولا شيء في يومٍ كلُّهم فيه على الموعد">
              <input type="time" value={prefs.digestTime} onChange={(e) => e.target.value && setPrefs({ digestTime: e.target.value })} className={[fieldClass, 'w-36'].join(' ')} />
            </Field>
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[14px] font-semibold text-text-primary dark:text-text-on-dark">أيام الميلاد والمناسبات (٩ صباحاً)</span>
          <Toggle checked={prefs.occasions} onChange={(v) => setPrefs({ occasions: v })} label="المناسبات" hideLabel />
        </div>
        <CallAutoLogSetting />
        <p className="text-[12px] text-text-muted text-pretty">
          ولكل شخص تذكيره الخاص يوم موعده: من صفحته ← تعديل ← «تذكير خاص».
        </p>
        <p className="flex items-start gap-1.5 text-[11.5px] text-text-muted text-pretty">
          <Lock size={13} className="mt-0.5 shrink-0" aria-hidden />
          الأسماء والأرقام والملاحظات في حسابك الخاص فقط، لا تُشارك مع أحد ولا تظهر في الترتيب — يظهر فيه مجموع نقاطك فحسب.
        </p>
      </div>
    </BottomSheet>
  );
}

/**
 * «صلة الرحم وبرّ الوالدين» — /silat. Tabs ?tab=home|parents|insights;
 * ?p=ID opens a person (notification deep links use it).
 * `embedded`: the body alone, inside «حياتي» (/study?tab=silat). There the
 * host owns `tab`, so the segment rides on `view`; a person opens full-screen
 * at /silat?p=ID (its own back button).
 */
export function SilatPage({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const people = useSilatStore((s) => s.people);
  const onboarded = useSilatStore((s) => s.onboarded);
  const setOnboarded = useSilatStore((s) => s.setOnboarded);
  const key = embedded ? 'view' : 'tab';
  const base: Record<string, string> = embedded ? { tab: 'silat' } : {};
  const rawTab = params.get(key) as Tab;
  const tab: Tab = TABS.includes(rawTab) ? rawTab : 'home';
  const pid = params.get('p');
  const open = pid ? people.find((p) => p.id === pid && !p.deletedAt) : undefined;
  const anyone = people.some((p) => !p.deletedAt);

  const [form, setForm] = useState<{ open: boolean; person: Person | null; relation?: string }>({ open: false, person: null });
  const [logFor, setLogFor] = useState<{ person: Person; suggest?: ContactType } | null>(null);
  const [msgFor, setMsgFor] = useState<Person | null>(null);
  const [settings, setSettings] = useState(false);

  // Idempotent: arms the reminders and follows the store, even before boot wiring exists.
  useEffect(() => {
    void rescheduleAllSilat();
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pid, tab]);

  const openPerson = (id: string) => (embedded ? navigate(`/silat?p=${id}`) : setParams({ ...(tab !== 'home' ? { tab } : {}), p: id }));
  const onLog = (person: Person, suggest?: ContactType) => setLogFor({ person, suggest });
  const add = (relation?: string) => setForm({ open: true, person: null, relation });

  const sheets = (
    <>
      <PersonFormSheet
        open={form.open}
        person={form.person}
        relation={form.relation}
        onClose={() => setForm((f) => ({ ...f, open: false }))}
        onSaved={(id) => {
          if (id || !pid) return; // deleted from its own page → back to the list
          if ((window.history.state as { idx?: number } | null)?.idx) navigate(-1);
          else setParams({}, { replace: true });
        }}
      />
      <LogSheet person={logFor?.person ?? null} suggest={logFor?.suggest} onClose={() => setLogFor(null)} />
      <TemplatesSheet
        person={msgFor}
        onClose={() => setMsgFor(null)}
        onSent={(person, suggest) => {
          setMsgFor(null);
          setLogFor({ person, suggest });
        }}
      />
      <SettingsSheet open={settings} onClose={() => setSettings(false)} />
    </>
  );

  if (embedded && pid) return <Navigate to={`/silat?p=${pid}`} replace />;
  if (open) {
    return (
      <>
        <PersonDetail person={open} onEdit={() => setForm({ open: true, person: open })} onLog={(s) => onLog(open, s)} onMessage={() => setMsgFor(open)} />
        {sheets}
      </>
    );
  }

  const showOnboarding = !anyone && !onboarded;
  const actions = anyone ? (
    <>
      <Button variant="icon" onClick={() => setSettings(true)} aria-label="التذكيرات">
        <Bell size={18} />
      </Button>
      <Button variant="icon" onClick={() => add()} aria-label="أضف شخصاً">
        <UserPlus size={18} />
      </Button>
    </>
  ) : undefined;
  const body = showOnboarding ? (
    <Onboarding />
  ) : !anyone ? (
    <EmptyState
      title="ابدأ بوالديك"
      description="أضف والديك وأرحامك ومن تحب، ليذكّرك رفيقك بصلتهم في موعدها."
      cta={{ label: 'ابدأ', onClick: () => setOnboarded(false) }}
    />
  ) : (
    <>
      <Segmented
        value={tab}
        onChange={(t) => setParams({ ...base, ...(t === 'home' ? {} : { [key]: t }) }, { replace: true })}
        options={[
          { value: 'home', label: 'أرحامي' },
          { value: 'parents', label: 'بِرّ الوالدين' },
          { value: 'insights', label: 'إحصاءات' },
        ]}
      />
      {tab === 'home' ? (
        <SilatHome onOpen={openPerson} onLog={onLog} onMessage={setMsgFor} onAdd={() => add()} />
      ) : tab === 'parents' ? (
        <ParentsView onOpen={openPerson} onLog={onLog} onAdd={add} />
      ) : (
        <InsightsView />
      )}
    </>
  );

  if (embedded) {
    return (
      <div className="flex flex-col gap-6">
        {actions ? (
          <div className="-mt-2 -mb-3 flex items-center justify-between gap-3">
            <p className="text-[13px] text-text-muted">«مَن وصلني وصله الله»</p>
            <div className="flex items-center gap-1">{actions}</div>
          </div>
        ) : null}
        {body}
        {sheets}
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-cream dark:bg-dark-bg">
      <TopAppBar title="صلة الرحم وبرّ الوالدين" subtitle="«مَن وصلني وصله الله»" showBack actions={actions} />
      <div className="px-4 pt-4 pb-28 flex flex-col gap-6 max-w-3xl mx-auto">{body}</div>
      {sheets}
    </div>
  );
}

export default SilatPage;
