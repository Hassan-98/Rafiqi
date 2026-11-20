/**
 * Executable check for «المجموعات» pure helpers (services/groupsLogic.ts).
 *   npx esbuild scripts/groups.test.ts --bundle --format=esm --platform=node --alias:@=./src \
 *     --outfile=.tmp-test/groups.mjs "--define:import.meta.env={}" && node .tmp-test/groups.mjs
 */
import assert from 'node:assert/strict';
import {
  CODE_ALPHABET,
  comingFriday,
  completionDuas,
  daysLeft,
  deadlineLabel,
  errorText,
  extractCode,
  goalProgress,
  groupNudges,
  juzCount,
  myKhatmaDays,
  inviteText,
  isMissing,
  isValidCode,
  juzCells,
  juzList,
  khatmaProgress,
  khatmasLabel,
  membersLabel,
  normalizeCode,
  num,
  personName,
  pickFreeJuz,
  ACCEPT_DUA,
  type KhatmaPart,
} from '@/services/groupsLogic';

// codes: 32 unambiguous characters, forgiving input
assert.equal(CODE_ALPHABET.length, 32);
assert.ok(!/[IO01]/.test(CODE_ALPHABET));
assert.equal(new Set(CODE_ALPHABET).size, 32);
assert.equal(normalizeCode(' ab c-2٣4 '), 'ABC234');
assert.ok(isValidCode('abc-234'));
assert.ok(!isValidCode('ABC1O4'), 'I/O/0/1 never appear in codes');
assert.ok(!isValidCode('ABC23'));
assert.ok(!isValidCode('ABC2345'));
const msg = inviteText('عائلة أحمد', 'K7P2QX');
assert.ok(msg.includes('K7P2QX') && msg.includes('رفيقي') && msg.includes('/groups?join=K7P2QX'));
assert.equal(extractCode(msg), 'K7P2QX', 'the whole share message pastes fine');
assert.equal(extractCode('/groups?join=k7p2qx'), 'K7P2QX');
assert.equal(extractCode('k7p2qx'), 'K7P2QX');
assert.equal(extractCode('الرمز: K7P2QX شكراً'), 'K7P2QX');
assert.equal(extractCode('hello'), null);

// people: the leaderboard's masking
assert.equal(personName({ name: 'سارة', tag: 4217, isMe: false }), 'سارة');
assert.equal(personName({ name: null, tag: 4217, isMe: false }), 'مجهول', 'no number: it identified people');
assert.equal(personName({ name: 'سارة', tag: 4217, isMe: true }), 'أنت');
assert.deepEqual([1, 2, 5, 10, 11, 50].map(membersLabel), ['عضو واحد', 'عضوان', '٥ أعضاء', '١٠ أعضاء', '١١ عضواً', '٥٠ عضواً']);
assert.deepEqual([1, 2, 3, 11].map(khatmasLabel), ['ختمة واحدة', 'ختمتان', '٣ ختمات', '١١ ختمة']);

// khatma grid
const p = (juz: number, isMe: boolean, done: boolean): KhatmaPart => ({ juz, isMe, done, name: null, tag: 1000 + juz });
const parts = [p(1, true, true), p(2, true, false), p(3, false, true), p(4, false, false)];
const cells = juzCells(parts);
assert.equal(cells.length, 30);
assert.deepEqual(cells.slice(0, 5).map((c) => c.state), ['mineDone', 'mine', 'done', 'taken', 'free']);
assert.equal(cells[29].juz, 30);
assert.deepEqual(khatmaProgress(parts), { done: 2, reading: 2, free: 26, pct: 7 });
assert.deepEqual(khatmaProgress([]), { done: 0, reading: 0, free: 30, pct: 0 });
assert.equal(khatmaProgress(Array.from({ length: 30 }, (_, i) => p(i + 1, false, true))).pct, 100);
assert.deepEqual(pickFreeJuz(parts, 5, 3), [5, 6, 7]);
assert.deepEqual(pickFreeJuz(parts, 3, 2), [5, 6], 'skips held juz');
assert.deepEqual(pickFreeJuz([p(30, false, false)], 29, 3), [29, 1, 2], 'wraps past 30');
assert.deepEqual(pickFreeJuz(Array.from({ length: 30 }, (_, i) => p(i + 1, false, false)), 1, 5), []);
assert.equal(juzList([4]), 'الجزء ٤');
assert.equal(juzList([4, 3]), 'الجزآن ٣ و٤');
assert.equal(juzList([5, 3, 4]), 'الأجزاء ٣، ٤، ٥');

// completion duas: the general one always, the fitting one by dedication
assert.deepEqual(completionDuas(null), [ACCEPT_DUA]);
assert.equal(completionDuas('على روح جدّنا').length, 2);
assert.ok(completionDuas('لشفاء أمّي').some((d) => d.source.includes('البخاري')));
assert.equal(completionDuas('ختمة رمضان').length, 1);

// goals
assert.deepEqual(goalProgress(0, 10_000), { pct: 0, left: 10_000, reached: false });
assert.deepEqual(goalProgress(9_999, 10_000), { pct: 99, left: 1, reached: false }, '100 only when reached');
assert.deepEqual(goalProgress(12_000, 10_000), { pct: 100, left: 0, reached: true });
assert.equal(daysLeft('2026-11-20', '2026-11-17'), 3);
assert.equal(daysLeft('2026-11-17', '2026-11-17'), 0);
assert.equal(daysLeft('2026-11-16', '2026-11-17'), -1);
assert.equal(daysLeft('2026-03-30', '2026-03-28'), 2, 'across a DST change');
assert.equal(deadlineLabel(0), 'ينتهي اليوم');
assert.equal(deadlineLabel(2), 'باقٍ يومان');
assert.equal(deadlineLabel(5), 'باقٍ ٥ أيام');
assert.equal(deadlineLabel(12), 'باقٍ ١٢ يوماً');
assert.equal(deadlineLabel(-1), 'انتهى وقته');
assert.equal(comingFriday(new Date(2026, 10, 17)), '2026-11-20', 'Tuesday → Friday');
assert.equal(comingFriday(new Date(2026, 10, 20, 22)), '2026-11-20', 'Friday → today');
assert.equal(comingFriday(new Date(2026, 10, 21)), '2026-11-27', 'Saturday → next week');
assert.equal(num(10000), '١٠٬٠٠٠');
assert.equal(num(33), '٣٣');

// errors: Arabic only, never the raw server text
assert.equal(errorText({ code: 'P0001', message: 'group_full' }), 'اكتمل عدد أعضاء المجموعة (٥٠ عضواً)');
assert.equal(errorText({ code: 'P0001', message: 'something internal' }), 'تعذّر إتمام الطلب');
assert.ok(errorText({ message: 'TypeError: Failed to fetch' }).includes('الإنترنت'));
assert.ok(errorText(null).includes('الإنترنت'));
assert.ok(isMissing({ code: 'PGRST202' }) && isMissing({ code: '42P01' }) && !isMissing({ code: 'P0001' }));

// Home / reminders
assert.deepEqual([1, 2, 7, 12].map(juzCount), ['جزء واحد', 'جزآن', '٧ أجزاء', '١٢ جزءاً']);
const nudges = groupNudges(
  [
    { id: 'a', name: 'العائلة', myJuzLeft: 2, goalDeadline: '2026-11-17' },
    { id: 'b', name: 'الصحبة', myJuzLeft: 0, goalDeadline: '2026-11-18' },
    { id: 'c', name: 'الحي', myJuzLeft: 1, goalDeadline: '2026-11-25' },
  ],
  '2026-11-17',
);
assert.deepEqual(nudges.map((n) => n.id), ['group.juz.a', 'group.goal.a', 'group.goal.b', 'group.juz.c']);
assert.equal(nudges[0].body, 'معك جزآن لم تُتمّها بعد');
assert.equal(nudges[0].to, '/groups?id=a&tab=khatma');
assert.ok(nudges[1].body.includes('اليوم') && nudges[2].body.includes('غداً'));
assert.deepEqual(groupNudges([{ id: 'x', name: 'x', goalDeadline: '2026-11-16' }], '2026-11-17'), [], 'a passed goal asks nothing');
const iso = (y: number, m: number, d: number, h: number) => new Date(y, m - 1, d, h).toISOString();
assert.deepEqual(
  myKhatmaDays([
    { id: 'k1', completedAt: iso(2026, 11, 17, 9), mine: true },
    { id: 'k1', completedAt: iso(2026, 11, 17, 9), mine: true },
    { id: 'k2', completedAt: iso(2026, 11, 17, 23), mine: true },
    { id: 'k3', completedAt: iso(2026, 11, 16, 1), mine: false },
  ]),
  { '2026-11-17': 2 },
  'local day, each khatma once, only the ones I read in',
);

console.log('groups: ok');
