/**
 * StorageService — Typed localStorage abstraction.
 * All keys are namespaced under 'myzikr:' to avoid collisions.
 */

export const STORAGE_NAMESPACE = 'myzikr:';
const NAMESPACE = STORAGE_NAMESPACE;

export interface IStorageService {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
  clear(): void;
  has(key: string): boolean;
}

export class StorageService implements IStorageService {
  private ns(key: string): string {
    return `${NAMESPACE}${key}`;
  }

  get<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(this.ns(key));
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch {
      console.warn(`[StorageService] Failed to read key "${key}"`);
      return null;
    }
  }

  set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(this.ns(key), JSON.stringify(value));
    } catch {
      console.warn(`[StorageService] Failed to write key "${key}"`);
    }
  }

  remove(key: string): void {
    localStorage.removeItem(this.ns(key));
  }

  /** Clears only keys belonging to this namespace. */
  clear(): void {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(NAMESPACE));
    keys.forEach(k => localStorage.removeItem(k));
  }

  has(key: string): boolean {
    return localStorage.getItem(this.ns(key)) !== null;
  }
}

export const storageService = new StorageService();
