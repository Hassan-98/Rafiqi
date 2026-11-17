import type { Coordinates } from '@/types';

export interface PlaceName {
  /** Human-readable city / locality (Arabic), e.g. "سوهاج". */
  city: string;
  /** Country name (Arabic), e.g. "مصر". */
  country: string;
}

/**
 * Reverse-geocode coordinates to an Arabic city + country using BigDataCloud's
 * free, key-less client endpoint. Returns null on any failure (caller keeps
 * showing raw coordinates).
 */
export async function reverseGeocode(coords: Coordinates): Promise<PlaceName | null> {
  try {
    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${coords.latitude}&longitude=${coords.longitude}&localityLanguage=ar`,
    );
    if (!res.ok) return null;
    const j = (await res.json()) as {
      city?: string;
      locality?: string;
      principalSubdivision?: string;
      countryName?: string;
    };
    // Build "locality، subdivision" (deduped) so we get e.g. "سوهاج، محافظة سوهاج".
    const parts = [j.locality || j.city, j.principalSubdivision].filter(Boolean) as string[];
    const unique = [...new Set(parts)];
    const city = unique.slice(0, 2).join('، ') || j.principalSubdivision || j.city || '';
    return { city, country: j.countryName ?? '' };
  } catch {
    return null;
  }
}

export interface ForwardGeocodeResult {
  coords: Coordinates;
  /** Resolved place label (Arabic where available), e.g. "القاهرة، مصر". */
  displayName: string;
}

/**
 * Forward-geocode a typed city name to coordinates via Nominatim (key-less).
 * Prayer times NEED coordinates — a typed city that never resolves used to
 * leave the user with no times and no adhan while onboarding showed the city
 * as their "location". Returns null on any failure (caller keeps the typed
 * label and explains that times need a detected location).
 */
export async function forwardGeocode(query: string): Promise<ForwardGeocodeResult | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&accept-language=ar`,
      { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) return null;
    const results = (await res.json()) as Array<{ lat?: string; lon?: string; display_name?: string }>;
    const hit = results[0];
    if (!hit?.lat || !hit.lon) return null;
    const latitude = Number(hit.lat);
    const longitude = Number(hit.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return { coords: { latitude, longitude }, displayName: hit.display_name ?? query };
  } catch {
    return null;
  }
}
