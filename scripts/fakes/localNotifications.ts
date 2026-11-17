/** In-memory stand-in for @capacitor/local-notifications (tests only). */
type N = { id: number; title: string; body: string; schedule?: { at?: Date; on?: Record<string, number>; repeats?: boolean }; extra?: unknown };

export const pending = new Map<number, N>();
export const calls: string[] = [];

export const LocalNotifications = {
  async listChannels() {
    return { channels: [] as { id: string }[] };
  },
  async createChannel() {},
  async deleteChannel() {},
  async registerActionTypes() {},
  async schedule({ notifications }: { notifications: N[] }) {
    for (const n of notifications) {
      calls.push(`schedule:${n.id}`);
      pending.set(n.id, n);
    }
  },
  async cancel({ notifications }: { notifications: { id: number }[] }) {
    for (const n of notifications) {
      calls.push(`cancel:${n.id}`);
      pending.delete(n.id);
    }
  },
  async getPending() {
    return { notifications: [...pending.values()] };
  },
  async requestPermissions() {
    return { display: 'granted' };
  },
};
