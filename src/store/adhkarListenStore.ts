import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeStorage } from './safeStorage';
import type { ListenPrefs } from '@/components/adhkar/listenLogic';

/** Listening-mode preferences for the adhkar reader (per device). */
interface AdhkarListenState extends ListenPrefs {
  /** «مستوى صوت التلاوة» 0..1, relative to the device media volume. */
  volume: number;
  muted: boolean;
  setPrefs: (patch: Partial<ListenPrefs & { volume: number; muted: boolean }>) => void;
}

export const useAdhkarListenStore = create<AdhkarListenState>()(
  persist(
    (set) => ({
      repeatMode: 'count',
      pause: 2,
      rate: 1,
      skipNoAudio: true,
      fixedTimes: 3,
      volume: 1,
      muted: false,
      setPrefs: (patch) => set(patch),
    }),
    { name: 'myzikr:adhkar-audio', storage: safeStorage },
  ),
);
