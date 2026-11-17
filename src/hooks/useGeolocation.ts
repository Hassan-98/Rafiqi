import { useState, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import type { Coordinates } from '@/types';

export type GeolocationStatus = 'idle' | 'loading' | 'success' | 'error' | 'denied';

export interface UseGeolocationResult {
  coords: Coordinates | null;
  status: GeolocationStatus;
  error: string | null;
  /** Resolves with the fresh coordinates (or null on failure). */
  request: () => Promise<Coordinates | null>;
}

/**
 * Location hook. On a real device it uses the Capacitor Geolocation plugin —
 * which triggers the NATIVE OS permission prompt and reads GPS — instead of
 * the browser `navigator.geolocation`, which inside the Android WebView often
 * neither prompts nor resolves. Falls back to `navigator.geolocation` on the
 * web (dev) build.
 */
export function useGeolocation(): UseGeolocationResult {
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [status, setStatus] = useState<GeolocationStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(async (): Promise<Coordinates | null> => {
    setStatus('loading');
    setError(null);

    // ── Native (Android/iOS) via Capacitor ──────────────────────────
    if (Capacitor.isNativePlatform()) {
      try {
        const perm = await Geolocation.requestPermissions({ permissions: ['location'] });
        const state = perm.location ?? perm.coarseLocation;
        if (state !== 'granted') {
          setStatus('denied');
          setError('تم رفض إذن الموقع. فعّله من إعدادات النظام.');
          return null;
        }
        const pos = await Geolocation.getCurrentPosition({
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000,
        });
        const next = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setCoords(next);
        setStatus('success');
        return next;
      } catch (e) {
        setStatus('error');
        setError(e instanceof Error ? e.message : 'تعذّر تحديد الموقع.');
        return null;
      }
    }

    // ── Web fallback ────────────────────────────────────────────────
    if (!navigator.geolocation) {
      setStatus('error');
      setError('المتصفح لا يدعم تحديد الموقع.');
      return null;
    }
    return new Promise<Coordinates | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const next = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          setCoords(next);
          setStatus('success');
          resolve(next);
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            setStatus('denied');
            setError('تم رفض إذن الموقع.');
          } else {
            setStatus('error');
            setError(err.message);
          }
          resolve(null);
        },
        { timeout: 10000, maximumAge: 300000 },
      );
    });
  }, []);

  return { coords, status, error, request };
}
