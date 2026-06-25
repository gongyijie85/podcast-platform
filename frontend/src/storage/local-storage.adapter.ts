const NS = 'podcast-platform:';

export const localStorageAdapter = {
  get<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(NS + key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(NS + key, JSON.stringify(value));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('localStorage.set failed', e);
    }
  },
  remove(key: string): void {
    localStorage.removeItem(NS + key);
  },
  clear(): void {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(NS))
      .forEach((k) => localStorage.removeItem(k));
  },
};
