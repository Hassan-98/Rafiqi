import { useEffect, useState, useRef } from 'react';

interface UseDeviceHeadingResult {
  heading: number | null;
  absolute: boolean;
  accuracy: number | null;
  permissionState: 'granted' | 'denied' | 'unknown';
  request: () => Promise<boolean>;
  supported: boolean;
}

interface OrientationEvent extends Event {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  absolute: boolean;
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
}

declare global {
  interface DeviceOrientationEventConstructor {
    requestPermission?: () => Promise<'granted' | 'denied'>;
  }
}

/**
 * Live compass heading via `deviceorientation`. Returns the bearing of the
 * top of the device (0° = north). Applies a tiny low-pass filter to reduce
 * jitter. On iOS the user must explicitly grant permission via `request()`.
 */
export function useDeviceHeading(): UseDeviceHeadingResult {
  const [heading, setHeading] = useState<number | null>(null);
  const [absolute, setAbsolute] = useState(true);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [permissionState, setPermissionState] = useState<'granted' | 'denied' | 'unknown'>('unknown');
  const supported = typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
  const lastRef = useRef<number | null>(null);

  const attach = () => {
    if (!supported) return;
    const handler = (raw: Event) => {
      const e = raw as OrientationEvent;
      let h: number | null = null;
      if (typeof e.webkitCompassHeading === 'number') {
        h = e.webkitCompassHeading;
        setAccuracy(e.webkitCompassAccuracy ?? null);
        setAbsolute(true);
      } else if (typeof e.alpha === 'number') {
        // alpha is rotation around z-axis, 0 when facing north (in absolute frame).
        h = (360 - e.alpha) % 360;
        setAbsolute(!!e.absolute);
      }
      if (h == null) return;
      // Low-pass filter
      const prev = lastRef.current;
      const smoothed = prev == null ? h : prev + ((((h - prev + 540) % 360) - 180) * 0.25);
      const normalized = (smoothed + 360) % 360;
      lastRef.current = normalized;
      setHeading(normalized);
    };
    window.addEventListener('deviceorientationabsolute', handler, true);
    window.addEventListener('deviceorientation', handler, true);
    return () => {
      window.removeEventListener('deviceorientationabsolute', handler, true);
      window.removeEventListener('deviceorientation', handler, true);
    };
  };

  useEffect(() => {
    // iOS requires explicit permission; everywhere else, just attach.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctor = (window as any).DeviceOrientationEvent;
    const needsPermission = Ctor && typeof Ctor.requestPermission === 'function';
    if (needsPermission) {
      setPermissionState('unknown');
      return undefined;
    }
    setPermissionState('granted');
    const cleanup = attach();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const request = async (): Promise<boolean> => {
    if (!supported) return false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctor = (window as any).DeviceOrientationEvent;
    if (Ctor && typeof Ctor.requestPermission === 'function') {
      try {
        const r = await Ctor.requestPermission();
        if (r === 'granted') {
          setPermissionState('granted');
          attach();
          return true;
        }
        setPermissionState('denied');
        return false;
      } catch {
        setPermissionState('denied');
        return false;
      }
    }
    setPermissionState('granted');
    attach();
    return true;
  };

  return { heading, absolute, accuracy, permissionState, request, supported };
}
