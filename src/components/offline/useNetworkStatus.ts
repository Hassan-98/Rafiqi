import { useEffect, useState } from 'react';
import { Network, type ConnectionType } from '@capacitor/network';

export interface NetStatus {
  connected: boolean;
  type: ConnectionType;
}

/** Live connection status (Network plugin; navigator.onLine on web). */
export function useNetworkStatus(): NetStatus {
  const [st, setSt] = useState<NetStatus>(() => ({
    connected: typeof navigator === 'undefined' || navigator.onLine !== false,
    type: 'unknown',
  }));
  useEffect(() => {
    let alive = true;
    void Network.getStatus()
      .then((s) => alive && setSt({ connected: s.connected, type: s.connectionType }))
      .catch(() => undefined);
    const sub = Network.addListener('networkStatusChange', (s) => setSt({ connected: s.connected, type: s.connectionType }));
    return () => {
      alive = false;
      void sub.then((h) => h.remove()).catch(() => undefined);
    };
  }, []);
  return st;
}
