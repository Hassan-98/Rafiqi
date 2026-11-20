import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeStorage } from '@/store/safeStorage';
import { dayKey } from '@/store/studyModel';
import { relationOf, type ContactType } from '@/data/silatContent';
import { DEFAULT_PREFS, type Person, type SilatEntry, type SilatPrefs } from '@/store/silatModel';

/** Years of contacts; the page reads the last few months, the heat calendar six. */
const MAX_ENTRIES = 6000;
const makeId = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

export type NewPerson = Omit<Person, 'id' | 'createdAt' | 'everyDays'> & Partial<Pick<Person, 'everyDays'>>;

interface SilatState {
  people: Person[];
  /** Newest first. */
  entries: SilatEntry[];
  prefs: SilatPrefs;
  /** The first-run walkthrough was finished or skipped. */
  onboarded: boolean;
  addPerson: (input: NewPerson) => string;
  updatePerson: (id: string, patch: Partial<Person>) => void;
  /** Tombstone — see Person.deletedAt. */
  removePerson: (id: string) => void;
  log: (personId: string, type: ContactType, extra?: Partial<Pick<SilatEntry, 'note' | 'durationMin' | 'at' | 'auto'>>) => string;
  removeEntry: (id: string) => void;
  /** Put a removed entry back (the «تراجع» of a delete). */
  restoreEntry: (e: SilatEntry) => void;
  startRepair: (id: string) => void;
  endRepair: (id: string) => void;
  setPrefs: (patch: Partial<SilatPrefs>) => void;
  setOnboarded: (v: boolean) => void;
}

/**
 * «صلة الرحم» — people (with their phone numbers and notes: the user's own
 * synced, private storage; nothing is ever shared) and the contact log.
 */
export const useSilatStore = create<SilatState>()(
  persist(
    (set) => {
      const patchPerson = (id: string, fn: (p: Person) => Person) =>
        set((s) => ({ people: s.people.map((p) => (p.id === id ? fn(p) : p)) }));
      return {
        people: [],
        entries: [],
        prefs: DEFAULT_PREFS,
        onboarded: false,

        addPerson: (input) => {
          const id = makeId();
          const everyDays = input.everyDays ?? relationOf(input.relation)?.everyDays ?? 30;
          const tone = input.tone ?? Math.floor(Math.random() * 8);
          set((s) => ({ people: [...s.people, { ...input, everyDays, tone, id, createdAt: Date.now() }] }));
          return id;
        },

        updatePerson: (id, patch) => patchPerson(id, (p) => ({ ...p, ...patch, id: p.id })),

        removePerson: (id) => patchPerson(id, (p) => ({ ...p, deletedAt: Date.now() })),

        log: (personId, type, extra = {}) => {
          const at = Math.min(extra.at ?? Date.now(), Date.now());
          const e: SilatEntry = { ...extra, id: makeId(), personId, type, at, day: dayKey(at) };
          set((s) => ({ entries: [e, ...s.entries].sort((a, b) => b.at - a.at).slice(0, MAX_ENTRIES) }));
          return e.id;
        },

        removeEntry: (id) => set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),

        restoreEntry: (e) =>
          set((s) => (s.entries.some((x) => x.id === e.id) ? s : { entries: [e, ...s.entries].sort((a, b) => b.at - a.at) })),

        startRepair: (id) => patchPerson(id, (p) => ({ ...p, repair: { since: Date.now() } })),

        endRepair: (id) => patchPerson(id, (p) => (p.repair ? { ...p, repair: { ...p.repair, endedAt: Date.now() } } : p)),

        setPrefs: (patch) => set((s) => ({ prefs: { ...s.prefs, ...patch } })),

        setOnboarded: (v) => set({ onboarded: v }),
      };
    },
    { name: 'myzikr:silat', storage: safeStorage },
  ),
);
