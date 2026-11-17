import { create } from 'zustand';

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface ToastEntry {
  id: string;
  kind: ToastKind;
  title: string;
  body?: string;
  /** Auto-dismiss after this many ms. Default 3000. Pass 0 to disable. */
  durationMs?: number;
  /** Optional inline action (e.g. "Undo"). */
  action?: { label: string; onPress: () => void };
}

interface ToastState {
  toasts: ToastEntry[];
  push: (entry: Omit<ToastEntry, 'id'>) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

let counter = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (entry) => {
    const id = `t_${Date.now()}_${++counter}`;
    set((s) => ({ toasts: [...s.toasts, { id, ...entry }] }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

/** Convenience helpers that compose `useToastStore.push` with sensible defaults. */
export const toast = {
  success(title: string, body?: string): string {
    return useToastStore.getState().push({ kind: 'success', title, body, durationMs: 2400 });
  },
  error(title: string, body?: string): string {
    return useToastStore.getState().push({ kind: 'error', title, body, durationMs: 3600 });
  },
  info(title: string, body?: string): string {
    return useToastStore.getState().push({ kind: 'info', title, body, durationMs: 2800 });
  },
  warning(title: string, body?: string): string {
    return useToastStore.getState().push({ kind: 'warning', title, body, durationMs: 3000 });
  },
};
