import type { Coordinates } from '@/types';
import { distanceKm } from './QiblaService';
import { storageService } from './StorageService';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SEARCH_RADIUS_M = 5000; // 5 km

export interface Mosque {
  id: string;
  name: string;
  lat: number;
  lng: number;
  distanceKm: number;
  bearing: number;
  address?: string;
}

interface OverpassResponse {
  elements: Array<{
    id: number;
    lat?: number;
    lon?: number;
    center?: { lat: number; lon: number };
    tags?: Record<string, string>;
  }>;
}

function bearing(from: Coordinates, to: Coordinates): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

class MosquesService {
  async getNearby(coords: Coordinates): Promise<Mosque[]> {
    const latRound = coords.latitude.toFixed(3);
    const lngRound = coords.longitude.toFixed(3);
    const cacheKey = `mosques_${latRound}_${lngRound}`;
    const cached = storageService.get<{ data: Mosque[]; timestamp: number }>(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data.map((m) => ({
        ...m,
        // Recompute distance/bearing relative to current coords in case user moved.
        distanceKm: distanceKm(coords, { latitude: m.lat, longitude: m.lng }),
        bearing: bearing(coords, { latitude: m.lat, longitude: m.lng }),
      })).sort((a, b) => a.distanceKm - b.distanceKm);
    }

    const query = `[out:json][timeout:25];(node["amenity"="place_of_worship"]["religion"="muslim"](around:${SEARCH_RADIUS_M},${coords.latitude},${coords.longitude});way["amenity"="place_of_worship"]["religion"="muslim"](around:${SEARCH_RADIUS_M},${coords.latitude},${coords.longitude}););out center;`;

    const res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
    });
    if (!res.ok) throw new Error(`Overpass ${res.status}`);
    const json = (await res.json()) as OverpassResponse;

    const items: Mosque[] = json.elements
      .map((el) => {
        const lat = el.lat ?? el.center?.lat;
        const lon = el.lon ?? el.center?.lon;
        if (lat == null || lon == null) return null;
        const target = { latitude: lat, longitude: lon };
        const tags = el.tags ?? {};
        return {
          id: String(el.id),
          name: tags['name:ar'] ?? tags.name ?? 'مسجد',
          lat,
          lng: lon,
          distanceKm: distanceKm(coords, target),
          bearing: bearing(coords, target),
          address: tags['addr:full'] ?? tags['addr:street'],
        } as Mosque;
      })
      .filter((m): m is Mosque => m !== null)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 30);

    storageService.set(cacheKey, { data: items, timestamp: Date.now() });
    return items;
  }
}

export const mosquesService = new MosquesService();
