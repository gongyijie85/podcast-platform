import '@testing-library/jest-dom';

class MemoryStorage implements Storage {
  get length(): number {
    return Object.keys(this).length;
  }

  clear(): void {
    Object.keys(this).forEach((key) => {
      delete (this as unknown as Record<string, string>)[key];
    });
  }

  getItem(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(this, key)
      ? (this as unknown as Record<string, string>)[key]
      : null;
  }

  key(index: number): string | null {
    return Object.keys(this)[index] ?? null;
  }

  removeItem(key: string): void {
    delete (this as unknown as Record<string, string>)[key];
  }

  setItem(key: string, value: string): void {
    (this as unknown as Record<string, string>)[key] = String(value);
  }
}

Object.defineProperty(globalThis, 'Storage', {
  configurable: true,
  writable: true,
  value: MemoryStorage,
});

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: new MemoryStorage(),
});

Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: globalThis.localStorage,
});
