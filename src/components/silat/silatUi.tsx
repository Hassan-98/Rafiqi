import type { ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import {
  Flower2, Footprints, Gift, HandCoins, HandHeart, HandHelping, Handshake, HeartHandshake, House, Mic, MessageCircle,
  Moon, PartyPopper, Phone, ScrollText, Soup, Stethoscope, Tent, Trees, UtensilsCrossed, Video, Wallet,
  type LucideIcon,
} from 'lucide-react';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { toast, useToastStore } from '@/store/toastStore';
import { useSilatStore } from '@/store/silatStore';
import { useSettingsStore } from '@/store/settingsStore';
import { dayKey } from '@/store/studyModel';
import { CONTACT, RECONCILE_POINTS, TYPE_TEXT, isContact, withPronoun, type ContactType, type SilatText } from '@/data/silatContent';
import { countsFor, displayName, isFemale, milestoneOf, reconcileEntry, repairing, type Person, type PersonStatus } from '@/store/silatModel';
import { toArabicDigits as ar } from '@/utils/arabicFormat';

export const TYPE_ICON: Record<ContactType, LucideIcon> = {
  visit: House,
  help: HandHelping,
  gift: Gift,
  call: Phone,
  message: MessageCircle,
  dua: HandHeart,
  sadaqah: HandCoins,
  wudd: HeartHandshake,
  video: Video,
  voice: Mic,
  iyada: Stethoscope,
  invite: UtensilsCrossed,
  outing: Trees,
  food: Soup,
  money: Wallet,
  congrats: PartyPopper,
  condole: Flower2,
  islah: Handshake,
  grave: Footprints,
  debt: ScrollText,
  hajj: Tent,
};

/** Deeds (du'a, asking after, what reaches one who has died) wear gold; contact wears the accent. */
export const typeTone = (t: ContactType): string =>
  isContact(t) ? 'bg-teal/10 text-teal dark:bg-teal/15 dark:text-teal-light' : 'bg-gold/15 text-gold-dark dark:text-gold-light';

/** Avatar hues from Tailwind's own palette (like studyUi's platform tones): light -700 ink, dark -300. */
export const TONES = [
  'bg-teal/15 text-teal-dark dark:text-teal-light',
  'bg-gold/20 text-gold-dark dark:text-gold-light',
  'bg-rose-500/15 text-rose-700 dark:text-rose-300',
  'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  'bg-amber-500/20 text-amber-800 dark:text-amber-300',
  'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  'bg-orange-500/15 text-orange-700 dark:text-orange-300',
];

const initials = (name: string) => (name.trim().split(/\s+/)[0] ?? '').slice(0, 2) || '؟';

export function Avatar({ person, size = 44 }: { person: Person; size?: number }) {
  const gender = useSettingsStore((s) => s.gender);
  const tone = person.deceased ? 'bg-cream-dark/80 text-text-secondary dark:bg-white/[0.08] dark:text-text-on-dark/70' : TONES[(person.tone ?? 0) % TONES.length];
  return (
    <span
      className={['relative inline-flex items-center justify-center rounded-full font-display font-bold shrink-0', tone].join(' ')}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
      aria-hidden
    >
      {initials(displayName(person, gender))}
      {person.deceased ? (
        <span className="absolute -bottom-0.5 -end-0.5 w-4 h-4 rounded-full bg-white dark:bg-dark-card inline-flex items-center justify-center text-gold-dark dark:text-gold-light ring-1 ring-black/[0.05] dark:ring-white/[0.08]">
          <Moon size={10} />
        </span>
      ) : null}
    </span>
  );
}

const RING: Record<PersonStatus['state'], { from: string; to: string; track: string }> = {
  done: { from: 'var(--color-teal)', to: 'var(--color-teal-light)', track: 'var(--color-track)' },
  ok: { from: 'var(--color-teal)', to: 'var(--color-teal-light)', track: 'var(--color-track)' },
  due: { from: 'var(--color-gold)', to: 'var(--color-gold-light)', track: 'color-mix(in srgb, var(--color-gold) 55%, transparent)' },
  late: { from: 'var(--color-danger)', to: 'var(--color-danger)', track: 'color-mix(in srgb, var(--color-danger) 50%, transparent)' },
};

/** The avatar inside an arc of the time left before the person is due (gold = today, red = late). */
export function StatusAvatar({ person, status, size = 52 }: { person: Person; status?: PersonStatus; size?: number }) {
  if (!status) return <Avatar person={person} size={size} />;
  const c = RING[status.state];
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      <span className="absolute inset-0">
        <ProgressRing value={status.left * 100} size={size} strokeWidth={3} showPercent={false} colorFrom={c.from} colorTo={c.to} trackColor={c.track} />
      </span>
      <span className="absolute inset-[5px] flex">
        <Avatar person={person} size={size - 10} />
      </span>
    </span>
  );
}

export const STATE_TEXT: Record<PersonStatus['state'], string> = {
  done: 'text-teal dark:text-teal-light',
  ok: 'text-text-muted',
  due: 'text-gold-dark dark:text-gold-light',
  late: 'text-danger',
};

/** Qur'an in ﴿…﴾ with its sura and ayah, a hadith with its collection. `onAccent` on hero cards. */
export function Quote({ t, size = 'md', onAccent = false, className = '' }: { t: SilatText; size?: 'sm' | 'md' | 'lg'; onAccent?: boolean; className?: string }) {
  const cls = t.quran
    ? ['font-quran leading-loose', size === 'lg' ? 'text-[22px]' : size === 'md' ? 'text-[17px]' : 'text-[15px]'].join(' ')
    : ['leading-relaxed text-pretty', size === 'lg' ? 'text-[16px]' : size === 'md' ? 'text-[14px]' : 'text-[12.5px]'].join(' ');
  return (
    <figure className={className}>
      <blockquote className={[cls, onAccent ? 'text-on-accent' : 'text-text-primary dark:text-text-on-dark'].join(' ')}>
        {t.quran ? `﴿${t.text}﴾` : t.text}
      </blockquote>
      <figcaption className={['mt-1 text-[11px]', onAccent ? 'text-on-accent/70' : 'text-text-muted'].join(' ')}>
        {t.quran ? `سورة ${t.source}` : t.source}
      </figcaption>
    </figure>
  );
}

// ── links ────────────────────────────────────────────────────────────────────

export { cleanPhone, telHref, waHref } from '@/store/silatPhoneModel';

/** A plain link out (tel: to the dialer, wa.me to WhatsApp) — the WebView hands both to the OS. */
export function LinkOut({
  href,
  label,
  onOpen,
  className = '',
  children,
}: {
  href: string;
  label: string;
  onOpen?: () => void;
  className?: string;
  children: ReactNode;
}) {
  const external = href.startsWith('http');
  return (
    <a
      href={href}
      aria-label={label}
      target={external ? '_blank' : undefined}
      rel={external ? 'noopener noreferrer' : undefined}
      onClick={(e) => {
        e.stopPropagation();
        onOpen?.();
      }}
      className={className}
    >
      {children}
    </a>
  );
}

// ── logging ──────────────────────────────────────────────────────────────────

/**
 * Log a contact with its «تقبّل الله» toast and «تراجع». The toast shows the
 * points it earns (a type counts once per person a day; the first contact
 * after a broken tie adds RECONCILE_POINTS), then a person's milestone
 * («هذه صلتك العاشرة له») or, for the day's first of its kind, its fadl.
 */
export function logContact(p: Person, type: ContactType, extra?: { note?: string; durationMin?: number; at?: number }): string {
  const st = useSilatStore.getState();
  const gender = useSettingsStore.getState().gender;
  const female = isFemale(p, gender);
  const at = extra?.at ?? Date.now();
  const day = dayKey(at);
  const repeat = st.entries.some((e) => e.personId === p.id && e.type === type && e.day === day);
  const firstOfKind = !st.entries.some((e) => e.type === type && e.day === day);
  const firstAfterRift = repairing(p) && countsFor(p, type) && !reconcileEntry(p, st.entries);
  const nth = !p.deceased && countsFor(p, type) ? st.entries.filter((e) => e.personId === p.id && countsFor(p, e.type)).length + 1 : 0;
  const milestone = nth ? milestoneOf(nth) : null;
  const id = st.log(p.id, type, extra);
  const pts = (repeat ? 0 : CONTACT[type].points) + (firstAfterRift ? RECONCILE_POINTS : 0);
  const fadl = firstOfKind ? TYPE_TEXT[type] : undefined;
  const more = milestone ? withPronoun(`هذه صلتك ${milestone} ل{ه}، بارك الله فيك`, female) : fadl ? `${fadl.quran ? `﴿${fadl.text}﴾` : fadl.text} ${fadl.source}` : '';
  useToastStore.getState().push({
    kind: 'success',
    title: firstAfterRift ? `وصلتَ ما انقطع، تقبّل الله · +${ar(pts)}` : `تقبّل الله${pts ? ` · +${ar(pts)}` : ''}`,
    body: `${withPronoun(CONTACT[type].done, female)} — ${displayName(p, gender)}${more ? ` · ${more}` : ''}`,
    durationMs: more ? 7000 : 5000,
    action: { label: 'تراجع', onPress: () => useSilatStore.getState().removeEntry(id) },
  });
  return id;
}

/** A ready message to anyone: the share sheet (Android's or the browser's), else the clipboard. False when nothing was sent on. */
export async function shareMessage(text: string): Promise<boolean> {
  try {
    if (Capacitor.isNativePlatform()) {
      await Share.share({ text });
      return true;
    }
    if (navigator.share) {
      await navigator.share({ text });
      return true;
    }
  } catch {
    return false; // closed the share sheet
  }
  try {
    await navigator.clipboard.writeText(text);
    toast.success('نُسخت الرسالة، الصقها حيث تشاء');
    return true;
  } catch {
    toast.info('انسخ الرسالة يدوياً', text);
    return false;
  }
}

/** Day-of-year rotation for the daily texts and ideas. */
export function dailyIndex(now: number, n: number, offset = 0): number {
  const d = new Date(now);
  const doy = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 86_400_000);
  return (doy + offset) % n;
}
