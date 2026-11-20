/**
 * Executable check for «صلة الرحم» ↔ the phone (src/store/silatPhoneModel.ts):
 * number keys, the picked contact's number, the reminders' call buttons and
 * the call log → «اتصال» mapping with its dedupe.
 *
 * Run: npx esbuild scripts/silatPhone.test.ts --bundle --format=esm --platform=node --alias:@=./src
 *        "--define:import.meta.env={\"DEV\":false,\"PROD\":true,\"MODE\":\"test\"}" --loader:.woff=empty
 *        --loader:.woff2=empty --loader:.ttf=empty --loader:.svg=empty --loader:.css=empty
 *        --outfile=.tmp-test/silatPhone.mjs && node .tmp-test/silatPhone.mjs
 */
import assert from 'node:assert/strict';
import { cleanPhone, intlPhone, phoneKey, pickedPhone, planCallImport, silatNotifMeta, telHref, viaWhatsApp, waHref, type CallLogState, type CallRow } from '@/store/silatPhoneModel';
import { DEFAULT_PREFS, planSilatReminders, type Person, type SilatEntry } from '@/store/silatModel';
import { dayKey, parseKey } from '@/store/studyModel';
import { ACTION_TYPES, actionKindFor } from '@/services/notifications/actions';

const TODAY = '2026-11-17';
const at = (key: string, h = 10, m = 0) => {
  const d = parseKey(key);
  d.setHours(h, m, 0, 0);
  return d.getTime();
};
const person = (id: string, extra: Partial<Person> = {}): Person => ({
  id, name: id, relation: 'mother', everyDays: 1, createdAt: at('2026-10-01', 8), ...extra,
});

// ── numbers ──
{
  const k = phoneKey('01001234567');
  assert.equal(k, '001234567');
  assert.equal(phoneKey('+20 100 123 4567'), k);
  assert.equal(phoneKey('0020-100-123-4567'), k);
  assert.equal(phoneKey('٠١٠٠١٢٣٤٥٦٧'), k, 'Arabic-Indic digits');
  assert.equal(phoneKey('۰۱۰۰۱۲۳۴۵۶۷'), k, 'Persian digits');
  assert.equal(phoneKey('*100#'), null, 'a short code is nobody');
  assert.equal(phoneKey(undefined), null);
  assert.equal(cleanPhone(' +20 (100) 123-4567 '), '+201001234567');
  assert.equal(waHref('00201001234567'), 'https://wa.me/201001234567');
  // Egypt by default (owner 2026-11-19): a local number becomes +20…
  assert.equal(intlPhone('01146321817'), '+201146321817');
  assert.equal(intlPhone('٠١١٤٦٣٢١٨١٧'), '+201146321817');
  assert.equal(intlPhone('0225551234'), '+20225551234', 'a Cairo landline');
  assert.equal(intlPhone('+966501234567'), '+966501234567', 'a foreign number is kept');
  assert.equal(intlPhone('00966501234567'), '+966501234567');
  assert.equal(intlPhone('201146321817'), '+201146321817');
  assert.equal(waHref('01146321817'), 'https://wa.me/201146321817');
  assert.equal(telHref('01146321817'), 'tel:+201146321817');
  assert.equal(pickedPhone('0114 632 1817'), '+201146321817');

  assert.equal(pickedPhone('010 0123 4567', '+201001234567'), '+201001234567', 'Android’s E.164 wins');
  assert.equal(pickedPhone('00966 50 123 4567'), '+966501234567', '00 → +');
  assert.equal(pickedPhone('+966 50 123 4567', ''), '+966501234567');
  assert.equal(pickedPhone(' 010 0123 4567 ', null), '+201001234567', 'a local number → Egypt (owner 2026-11-19)');
  assert.equal(pickedPhone(' 12345 ', null), '12345', 'unsure (a short code) → kept as the contact has it');
  assert.equal(pickedPhone('0100', 'garbage'), '0100');
}

// ── notification buttons ──
{
  assert.equal(silatNotifMeta(person('a')), undefined, 'no number, no buttons');
  assert.deepEqual(silatNotifMeta(person('a', { phone: '01001234567' })), { person: 'a', silat: 'call_wa' });
  assert.deepEqual(silatNotifMeta(person('a', { phone: '01001234567', channels: ['call', 'visit'] })), { person: 'a', silat: 'call' });
  assert.deepEqual(silatNotifMeta(person('a', { phone: '01001234567', channels: ['message'] })), { person: 'a', silat: 'call_wa' });
  // a video call is a WhatsApp way too
  assert.deepEqual(silatNotifMeta(person('a', { phone: '01001234567', channels: ['call', 'video'] })), { person: 'a', silat: 'call_wa' });
  assert.equal(viaWhatsApp(undefined), true);
  assert.equal(viaWhatsApp(['visit', 'gift']), false);
  assert.equal(viaWhatsApp(['video']), true);
  assert.equal(silatNotifMeta(person('a', { phone: '01001234567', deceased: true })), undefined);
  assert.equal(silatNotifMeta(person('a', { phone: '123' })), undefined);

  assert.equal(actionKindFor({ moduleId: 'silat', meta: { person: 'a', silat: 'call' } }), 'silat_call');
  assert.equal(actionKindFor({ moduleId: 'silat', meta: { person: 'a', silat: 'call_wa' } }), 'silat_call_wa');
  assert.equal(actionKindFor({ moduleId: 'silat' }), 'snooze', 'no number → «ذكّرني» as before');
  const ids = (t: string) => ACTION_TYPES.find((x) => x.id === t)?.actions.map((a) => a.id);
  assert.deepEqual(ids('silat_call'), ['silat_call', 'snooze']);
  assert.deepEqual(ids('silat_call_wa'), ['silat_call', 'silat_wa', 'snooze']);

  // The digest's buttons are for the FIRST person it names; each person's own reminder carries theirs.
  const now = at(TODAY, 9);
  const mom = person('mom', { phone: '+201001234567', remind: true });
  const bro = person('bro', { relation: 'brother', everyDays: 7, phone: '01112223334', channels: ['call'], remind: true });
  const aunt = person('aunt', { relation: 'auntM', everyDays: 7 });
  const plan = planSilatReminders([aunt, bro, mom], [], DEFAULT_PREFS, now, 'male');
  const digest = plan.find((p) => p.id === 'myzikr_silat_digest')!;
  assert.ok(digest.body.startsWith('ينتظرون صلتك: mom'), digest.body);
  assert.deepEqual(digest.meta, { person: 'mom', silat: 'call_wa' });
  assert.deepEqual(plan.find((p) => p.id === 'myzikr_silat_p_bro')?.meta, { person: 'bro', silat: 'call' });
  // A first-named person without a number → no buttons on the digest.
  const noPhone = planSilatReminders([{ ...mom, phone: undefined }, bro], [], DEFAULT_PREFS, now, 'male');
  assert.equal(noPhone.find((p) => p.id === 'myzikr_silat_digest')?.meta, undefined);
}

// ── call log → entries ──
{
  const mom = person('mom', { phone: '+20 100 123 4567' });
  const dad = person('dad', { relation: 'father', phone: '0100 123 4567' }); // same home line
  const gone = person('gone', { phone: '01112223334', deceased: true });
  const bro = person('bro', { phone: '01555666777', deletedAt: 1 });
  const people = [mom, dad, gone, bro];
  const MOM = phoneKey(mom.phone)!;
  const now = at(TODAY, 20);
  const start = parseKey(TODAY).getTime();
  const st: CallLogState = { on: true, since: start, seen: [] };
  let id = 0;
  const row = (date: number, duration: number, type = 2, key = MOM): CallRow => ({ id: ++id, date, duration, type, key });

  const out = row(at(TODAY, 10), 125); // outgoing, 2 min
  const inc = row(at(TODAY, 11), 45, 1); // incoming, answered
  const short = row(at(TODAY, 12), 15); // too short
  const missed = row(at(TODAY, 13), 0, 3);
  const rejected = row(at(TODAY, 13, 5), 30, 5);
  const old = row(start - 1, 300); // before the watermark
  const deadLine = row(at(TODAY, 14, 30), 300, 2, phoneKey(gone.phone)!);
  const deleted = row(at(TODAY, 15), 300, 2, phoneKey(bro.phone)!);
  const rows = [inc, out, short, missed, rejected, old, deadLine, deleted];

  const r1 = planCallImport(rows, people, [], st, now);
  assert.deepEqual(
    r1.add.map((a) => [a.personId, a.at, a.durationMin, a.auto]),
    [
      ['mom', out.date, 2, out.date],
      ['dad', out.date, 2, out.date],
      ['mom', inc.date, 1, inc.date],
      ['dad', inc.date, 1, inc.date],
    ],
    'answered/connected ≥ 20 s, incoming too, to everyone on that number; oldest first',
  );
  assert.equal(r1.next.since, now - 6 * 3600_000, 'the next read reaches back over calls still going on');
  assert.deepEqual(new Set(r1.next.seen), new Set([deadLine.id, deleted.id]), 'only rows inside the overlap are remembered');

  // Re-read the same rows with nothing logged (the user undid them): seen rows stay undone.
  const again = planCallImport(rows, people, [], { ...st, seen: rows.map((r) => r.id) }, now);
  assert.equal(again.add.length, 0);

  // An entry carrying the call's start is that call — even after the device state was lost.
  const logged: SilatEntry[] = [{ id: 'x', personId: 'mom', type: 'call', at: out.date, day: TODAY, durationMin: 2, auto: out.date }];
  const r2 = planCallImport([out], [mom], logged, st, now);
  assert.equal(r2.add.length, 0);

  // Logged by hand after the call began that day → skipped; a hand-logged call from the morning is another call.
  const manual: SilatEntry[] = [{ id: 'm', personId: 'mom', type: 'call', at: at(TODAY, 10, 5), day: TODAY }];
  assert.equal(planCallImport([out], [mom], manual, st, now).add.length, 0);
  const morning: SilatEntry[] = [{ id: 'm', personId: 'mom', type: 'call', at: at(TODAY, 7), day: TODAY }];
  assert.equal(planCallImport([out], [mom], morning, st, now).add.length, 1);

  // The right day: a late-night call read the next morning stays on its own day.
  const late = row(at('2026-11-16', 23, 50), 600);
  const r3 = planCallImport([late], [mom], [], { on: true, since: at('2026-11-16', 0), seen: [] }, at(TODAY, 8));
  assert.equal(dayKey(r3.add[0].at), '2026-11-16');
  assert.equal(r3.add[0].durationMin, 10);
}

console.log('silatPhone: ok');
