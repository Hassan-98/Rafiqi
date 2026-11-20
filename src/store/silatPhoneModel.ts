/**
 * «صلة الرحم» ↔ the phone — PURE: phone numbers and their matching key, the
 * picked contact's number, the buttons a reminder carries, and the call log →
 * «اتصال» entries mapping. No store or plugin imports, so
 * scripts/silatPhone.test.ts runs it under plain node. The native side is
 * android/…/SilatPhonePlugin.java, the runtime services/silatPhone.ts.
 */
import { dayKey } from '@/store/studyModel';
import type { Person, SilatEntry } from '@/store/silatModel';
import type { ContactType } from '@/data/silatContent';

/** Latin digits, '+' kept: «٠١٠ ١٢٣» (or Persian «۰۱۰») → «010123». */
export const cleanPhone = (phone: string): string =>
  phone.replace(/[٠-٩۰-۹]/g, (d) => String(d.charCodeAt(0) & 0xf)).replace(/[^\d+]/g, '');

export const telHref = (phone: string): string => `tel:${intlPhone(phone)}`;

/**
 * The international form, Egypt by default (owner 2026-11-19: the app is Egyptian):
 * «01146321817» → «+201146321817», «0020…» → «+20…», «+…» kept. Anything else
 * (a short code, a foreign number already without its 0) is returned cleaned.
 */
export function intlPhone(phone: string): string {
  const c = cleanPhone(phone);
  if (c.startsWith('+')) return c;
  if (c.startsWith('00')) return `+${c.slice(2)}`;
  if (/^0\d{8,10}$/.test(c)) return `+20${c.slice(1)}`;
  if (/^20\d{9,10}$/.test(c)) return `+${c}`;
  return c;
}

/** wa.me wants the international number, digits only (no +, no 00). */
export function waHref(phone: string, text?: string): string {
  const digits = intlPhone(phone).replace(/^\+/, '');
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

/**
 * Saved numbers and call-log numbers meet on their last 9 digits, which drops
 * whatever prefix either side used (+20 / 0020 / 0). Null under 7 digits (a
 * short code is nobody). SilatPhonePlugin.key() applies the same rule natively.
 */
export function phoneKey(phone: string | undefined): string | null {
  const d = cleanPhone(phone ?? '').replace(/\D/g, '');
  return d.length >= 7 ? d.slice(-9) : null;
}

/**
 * The number to save from a picked contact: Android's international form when
 * it knows it (the contact's normalised number, or one formatted for the SIM's
 * country), «00…» turned into «+…», else the number exactly as the contact has it.
 */
export function pickedPhone(number: string, e164?: string | null): string {
  if (e164 && /^\+\d{7,15}$/.test(e164)) return e164;
  const c = intlPhone(number);
  return /^\+\d{7,}$/.test(c) ? c : number.trim();
}

// ── notification buttons ─────────────────────────────────────────────────────

/** WhatsApp is one of the ways to reach them: a message or a video call is, or no way was chosen. */
export const viaWhatsApp = (channels: readonly ContactType[] | undefined): boolean =>
  !channels?.length || channels.includes('message') || channels.includes('video');

/**
 * What a reminder about `p` carries for its buttons (notifications/actions.ts):
 * «اتصل» whenever there is a number, «واتساب» as well when WhatsApp is one of
 * the ways you reach them (viaWhatsApp). Undefined = no buttons.
 */
export function silatNotifMeta(p: Person): Record<string, string> | undefined {
  if (p.deceased || p.deletedAt || !phoneKey(p.phone)) return undefined;
  return { person: p.id, silat: viaWhatsApp(p.channels) ? 'call_wa' : 'call' };
}

// ── the call log ─────────────────────────────────────────────────────────────

/** One call-log row as SilatPhonePlugin.readCalls returns it (only rows whose key matched). */
export interface CallRow {
  /** CallLog.Calls._ID — unique on this phone. */
  id: number;
  /** Start of the call, epoch ms. */
  date: number;
  /** Seconds. */
  duration: number;
  /** CallLog.Calls.TYPE. */
  type: number;
  key: string;
}

/** This phone's import state (device-local, never synced). */
export interface CallLogState {
  on: boolean;
  /** Rows up to here were handled; the next read starts after it. */
  since: number;
  /** Ids of rows inside the overlap window already handled, so an undone entry stays undone. */
  seen: number[];
}

export interface AutoCall {
  personId: string;
  at: number;
  durationMin: number;
  /** The call's start, carried on the entry (SilatEntry.auto) so a re-read never logs it twice. */
  auto: number;
}

/** Missed, voicemail, rejected, blocked — not a conversation whatever the duration says. */
const NOT_TALKED = new Set([3, 4, 5, 6]);
export const MIN_CALL_SEC = 20;
/**
 * A row is written when the call ENDS but dated at its start, so a call still
 * going on during a read shows up later with an older date: the next read
 * reaches back this far. Longer calls than this are missed.
 */
const OVERLAP_MS = 6 * 3600_000;
/** A call logged by hand from this far before the call's start on is that call. */
const MANUAL_SLACK_MS = 10 * 60_000;

/**
 * New call-log rows → «اتصال» entries. A row counts once it was answered or
 * connected (incoming or outgoing) for at least MIN_CALL_SEC; it goes to every
 * living person whose number has its key. Skipped: rows already handled
 * (`seen`, or an entry with the same `auto`), and a call already logged by hand
 * that day after it began.
 */
export function planCallImport(
  rows: readonly CallRow[],
  people: readonly Person[],
  entries: readonly SilatEntry[],
  state: CallLogState,
  now: number,
): { add: AutoCall[]; next: CallLogState } {
  const byKey = new Map<string, Person[]>();
  for (const p of people) {
    const k = p.deletedAt || p.deceased ? null : phoneKey(p.phone);
    if (k) byKey.set(k, [...(byKey.get(k) ?? []), p]);
  }
  const seen = new Set(state.seen);
  const add: AutoCall[] = [];
  for (const r of [...rows].sort((a, b) => a.date - b.date)) {
    if (r.date <= state.since || seen.has(r.id)) continue;
    seen.add(r.id);
    if (NOT_TALKED.has(r.type) || r.duration < MIN_CALL_SEC) continue;
    const day = dayKey(r.date);
    for (const p of byKey.get(r.key) ?? []) {
      const dup = entries.some(
        (e) => e.personId === p.id && (e.auto === r.date || (e.type === 'call' && !e.auto && e.day === day && e.at >= r.date - MANUAL_SLACK_MS)),
      );
      if (!dup) add.push({ personId: p.id, at: r.date, durationMin: Math.max(1, Math.round(r.duration / 60)), auto: r.date });
    }
  }
  const since = Math.max(state.since, now - OVERLAP_MS);
  return { add, next: { on: state.on, since, seen: rows.filter((r) => r.date > since && seen.has(r.id)).map((r) => r.id) } };
}
