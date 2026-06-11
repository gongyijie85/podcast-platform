import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { localStorageAdapter } from '../storage/local-storage.adapter';

describe('localStorageAdapter', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('returns null for missing keys', () => {
    expect(localStorageAdapter.get('missing')).toBeNull();
  });

  it('round-trips strings', () => {
    localStorageAdapter.set('greet', 'hi');
    expect(localStorageAdapter.get<string>('greet')).toBe('hi');
  });

  it('round-trips objects', () => {
    const obj = { a: 1, b: ['x', 'y'], c: { nested: true } };
    localStorageAdapter.set('cfg', obj);
    expect(localStorageAdapter.get<typeof obj>('cfg')).toEqual(obj);
  });

  it('round-trips arrays', () => {
    const arr = [1, 2, 3];
    localStorageAdapter.set('arr', arr);
    expect(localStorageAdapter.get<number[]>('arr')).toEqual(arr);
  });

  it('preserves the namespaced key prefix', () => {
    localStorageAdapter.set('a', 1);
    const keys = Object.keys(localStorage);
    expect(keys.some((k) => k.startsWith('podcast-platform:'))).toBe(true);
    expect(keys.find((k) => k === 'podcast-platform:a')).toBeDefined();
  });

  it('removes a single key by name', () => {
    localStorageAdapter.set('foo', 'bar');
    localStorageAdapter.remove('foo');
    expect(localStorageAdapter.get('foo')).toBeNull();
  });

  it('clear() removes only namespaced keys', () => {
    localStorage.setItem('other', 'leave-me');
    localStorageAdapter.set('mine', 'remove-me');
    localStorageAdapter.clear();
    expect(localStorage.getItem('other')).toBe('leave-me');
    expect(localStorageAdapter.get('mine')).toBeNull();
  });

  it('returns null when stored JSON is corrupt', () => {
    localStorage.setItem('podcast-platform:bad', '{not valid json');
    expect(localStorageAdapter.get('bad')).toBeNull();
  });

  it('does not throw when localStorage is full (quota exceeded)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    // Should swallow the error and warn — not throw
    expect(() => localStorageAdapter.set('big', 'x')).not.toThrow();
    expect(warn).toHaveBeenCalled();
    setItemSpy.mockRestore();
    warn.mockRestore();
  });
});
