import { useEffect, useState, type ReactNode } from 'react';
import { BookUser } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { NumberInput } from '@/components/ui/NumberInput';
import { TextInput } from '@/components/ui/TextInput';
import { Pill, fieldClass } from '@/components/study/studyUi';
import { CHANNELS, CONTACT, RHYTHMS, SINCE_CHOICES, type ContactType } from '@/data/silatContent';
import type { SinceChoice } from '@/store/silatModel';
import { WEEKDAY_AR } from '@/store/studyModel';
import { pickContact, silatPhoneCaps } from '@/services/silatPhone';

/**
 * The per-person fields the first-run tour and the add/edit sheet share: the
 * plan (with its optional weekday), «متى وصلته آخر مرة؟», the number with
 * Android's contact picker, and the preferred ways of reaching them.
 */

/** The app's week runs Saturday → Friday. */
const WEEK = [6, 0, 1, 2, 3, 4, 5];

let pickable: Promise<boolean> | null = null;

/** Android's contact picker is available (checked once per run). */
export function useCanPick(): boolean {
  const [can, setCan] = useState(false);
  useEffect(() => {
    let live = true;
    void (pickable ??= silatPhoneCaps().then((c) => c.pickContact)).then((v) => live && setCan(v));
    return () => {
      live = false;
    };
  }, []);
  return can;
}

/** A labelled group of chips (a div, not a <label>: a label would forward its clicks to the first chip). */
export function ChipGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-text-secondary dark:text-text-on-dark/75">{label}</span>
      {children}
    </div>
  );
}

/** «يومياً · كل يومين · … · شهرياً · مخصّص…», and for a week or longer an optional weekday. */
export function PlanChips({
  label,
  every,
  weekday,
  onChange,
}: {
  label: string;
  every: number;
  weekday?: number;
  onChange: (every: number, weekday: number | undefined) => void;
}) {
  const preset = RHYTHMS.some((r) => r.days === every);
  const [customOpen, setCustomOpen] = useState(!preset);
  const custom = customOpen || !preset;
  return (
    <ChipGroup label={label}>
      <div className="flex flex-wrap gap-1.5">
        {RHYTHMS.map((r) => (
          <Pill
            key={r.days}
            active={!custom && every === r.days}
            onClick={() => {
              setCustomOpen(false);
              onChange(r.days, weekday);
            }}
          >
            {r.label}
          </Pill>
        ))}
        <Pill active={custom} onClick={() => setCustomOpen(true)}>
          مخصّص…
        </Pill>
      </div>
      {custom || every >= 7 ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-text-secondary dark:text-text-on-dark/80">
          {custom ? (
            <span className="flex items-center gap-2">
              كل
              <NumberInput value={every} onValueChange={(n) => onChange(n, weekday)} min={1} max={365} className={[fieldClass, 'w-20 text-center'].join(' ')} aria-label="عدد الأيام" />
              يوماً
            </span>
          ) : null}
          {every >= 7 ? (
            <span className="flex items-center gap-2">
              في يوم
              <select
                value={weekday ?? ''}
                onChange={(e) => onChange(every, e.target.value === '' ? undefined : Number(e.target.value))}
                className={[fieldClass.replace('w-full ', ''), 'w-32'].join(' ')}
                aria-label="اليوم المفضّل"
              >
                <option value="">أيّ يوم</option>
                {WEEK.map((d) => (
                  <option key={d} value={d}>
                    {WEEKDAY_AR[d]}
                  </option>
                ))}
              </select>
            </span>
          ) : null}
        </div>
      ) : null}
    </ChipGroup>
  );
}

/** «قريباً (هذا الأسبوع) · هذا الشهر · منذ زمن». */
export function SinceChips({ label, value, onChange }: { label: string; value: SinceChoice; onChange: (v: SinceChoice) => void }) {
  return (
    <ChipGroup label={label}>
      <div className="flex flex-wrap gap-1.5">
        {SINCE_CHOICES.map((c) => (
          <Pill key={c.id} active={value === c.id} onClick={() => onChange(c.id)}>
            {c.label}
          </Pill>
        ))}
      </div>
    </ChipGroup>
  );
}

export function ChannelChips({ label, value, onChange }: { label: string; value: ContactType[]; onChange: (v: ContactType[]) => void }) {
  return (
    <ChipGroup label={label}>
      <div className="flex flex-wrap gap-1.5">
        {CHANNELS.map((t) => (
          <Pill key={t} active={value.includes(t)} onClick={() => onChange(value.includes(t) ? value.filter((c) => c !== t) : [...value, t])}>
            {CONTACT[t].label}
          </Pill>
        ))}
      </div>
    </ChipGroup>
  );
}

/** The number, and on Android «اختر من جهات الاتصال» (its international form via pickContact; the name goes to `onPickedName`). */
export function PhoneInput({ value, onChange, onPickedName }: { value: string; onChange: (v: string) => void; onPickedName?: (name: string) => void }) {
  const canPick = useCanPick();
  const pick = async () => {
    const c = await pickContact();
    if (!c) return;
    onChange(c.phone);
    if (c.name) onPickedName?.(c.name);
  };
  return (
    <div className="flex flex-wrap gap-2">
      <TextInput
        value={value}
        onValueChange={onChange}
        className={[fieldClass, 'flex-1 min-w-[10rem]'].join(' ')}
        type="tel"
        inputMode="tel"
        dir="ltr"
        placeholder="+20 100 123 4567"
        aria-label="رقم الهاتف"
      />
      {canPick ? (
        <Button variant="soft" size="sm" className="shrink-0" leftIcon={<BookUser size={15} />} onClick={() => void pick()}>
          اختر من جهات الاتصال
        </Button>
      ) : null}
    </div>
  );
}
