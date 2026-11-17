import type { Coordinates } from '@/types';

/** Kaaba in Makkah — center coordinates. */
export const KAABA: Coordinates = { latitude: 21.4225, longitude: 39.8262 };

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

/**
 * Great-circle initial bearing from `from` to the Kaaba, in degrees clockwise
 * from true north. Result is normalized to [0, 360).
 */
export function bearingToKaaba(from: Coordinates): number {
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(KAABA.latitude);
  const dLon = toRad(KAABA.longitude - from.longitude);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const brng = (toDeg(Math.atan2(y, x)) + 360) % 360;
  return brng;
}

/** Haversine distance between two coords in kilometres. */
export function distanceKm(a: Coordinates, b: Coordinates): number {
  const R = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}
