/**
 * Her everyday house chores on Home (owner 2026-11-16) — PURE; registered as an
 * attention source in ./plugins.ts (women only). From 2 pm until each is logged.
 */
import { format } from 'date-fns';
import type { AttentionItem } from '@/services/dayAttention';

/** The everyday chores Home reminds her of. */
export const DAILY_CHORES = ['cook', 'dishes', 'tidy'];

export function houseAttention(entries: readonly { chore: string; day: string }[], now: Date): AttentionItem[] {
  if (now.getHours() < 14) return [];
  const today = format(now, 'yyyy-MM-dd');
  const done = new Set(entries.filter((e) => e.day === today).map((e) => e.chore));
  const left = DAILY_CHORES.filter((c) => !done.has(c));
  if (!left.length) return [];
  return [
    {
      id: 'house.today',
      level: 'suggest',
      weight: 'extra',
      icon: 'house',
      kicker: 'مهام المنزل',
      title: 'سجّلي ما أنجزتِه في بيتك اليوم',
      body: '«كان النبي ﷺ يكون في مهنة أهله» — بنيّةٍ صالحة تصير عبادة، ولها نقاطها في الترتيب',
      to: '/study?tab=house',
      habit: 'house',
      action: { kind: 'chores', chores: left },
      why: 'لأنكِ لم تسجّليها اليوم بعد',
    },
  ];
}
