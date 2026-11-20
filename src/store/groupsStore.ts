import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeStorage } from '@/store/safeStorage';
import { myKhatmaDays, type KhatmaPart, type Person } from '@/services/groupsLogic';
import type { LbPeriod, LbRow } from '@/services/leaderboard';

/**
 * «المجموعات» — the last data from the server, so a group opens offline
 * (`myzikr:groups`). Written only by services/groups.ts; kept free of runtime
 * imports of the services so the board (leaderboard.ts) can read it without a cycle.
 */

export interface GroupSummary {
  id: string;
  name: string;
  description: string | null;
  isOwner: boolean;
  members: number;
  khatmaDone: number;
  khatmaOpen: boolean;
  /** My juz still unread in the running khatma. */
  myJuzLeft?: number;
  /** The running goal's last day ('yyyy-MM-dd'), if it has one. */
  goalDeadline?: string | null;
  /** The guest's secret for claim_groups() — see claimGuest(). */
  claim?: string;
}
export interface Member extends Person {
  no: number;
  isOwner: boolean;
  joinedAt: string;
}
export interface Khatma {
  id: string;
  title: string;
  dedication: string | null;
  createdAt: string;
  completedAt: string | null;
  canCancel: boolean;
  parts: KhatmaPart[];
}
export interface PastKhatma {
  id: string;
  title: string;
  dedication: string | null;
  createdAt: string;
  completedAt: string;
  readers: number;
  /** I read a juz in it. */
  mine?: boolean;
}
export interface GoalTop extends Person {
  count: number;
}
export interface Goal {
  id: string;
  title: string;
  target: number;
  deadline: string | null;
  createdAt: string;
  closed: boolean;
  canClose: boolean;
  total: number;
  mine: number;
  contributors: number;
  top: GoalTop[];
}
export interface GroupState {
  group: { id: string; name: string; description: string | null; code: string; isOwner: boolean; createdAt: string };
  members: Member[];
  khatma: Khatma | null;
  history: PastKhatma[];
  goal: Goal | null;
}

export type GroupPeriod = Extract<LbPeriod, 'today' | 'week' | 'month'>;
/** 'away' = a guest who left «الترتيب»: groups share that identity, so there is none. */
export type GroupsStatus = 'idle' | 'ok' | 'offline' | 'missing' | 'away';

interface GroupsCache {
  status: GroupsStatus;
  list: GroupSummary[] | null;
  groups: Record<string, GroupState>;
  /** `${groupId}|${period}` → the group's ranking. */
  boards: Record<string, LbRow[]>;
}

export const useGroupsStore = create<GroupsCache>()(
  persist(() => ({ status: 'idle' as GroupsStatus, list: null as GroupSummary[] | null, groups: {}, boards: {} }), {
    name: 'myzikr:groups',
    storage: safeStorage,
    partialize: ({ list, groups, boards }) => ({ list, groups, boards }),
  }),
);

/**
 * For a «ختمة جماعية» bonus on the board: day → completed group khatmas I read
 * in, from the cached groups (each group's history is cached once it is opened).
 */
export function groupKhatmaDays(): Record<string, number> {
  return myKhatmaDays(Object.values(useGroupsStore.getState().groups).flatMap((g) => g.history ?? []));
}
