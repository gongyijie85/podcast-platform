import { describe, expect, it, beforeEach, vi } from 'vitest';
import { getScanHistory, addScanHistory, clearScanHistory, type ScanHistoryItem } from '@/utils/scan-history';
import { localStorageAdapter } from '@/storage/local-storage.adapter';

vi.mock('@/storage/local-storage.adapter', () => ({
  localStorageAdapter: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
  },
}));

describe('scan-history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when no history', () => {
    (localStorageAdapter.get as ReturnType<typeof vi.fn>).mockReturnValue(null);
    expect(getScanHistory()).toEqual([]);
  });

  it('adds item to the front of history', () => {
    (localStorageAdapter.get as ReturnType<typeof vi.fn>).mockReturnValue([]);
    addScanHistory({ isbn: '9780135957059', title: 'The Pragmatic Programmer', author: 'Andrew Hunt' });
    expect(localStorageAdapter.set).toHaveBeenCalledTimes(1);
    const saved = (localStorageAdapter.set as ReturnType<typeof vi.fn>).mock.calls[0][1] as ScanHistoryItem[];
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ isbn: '9780135957059', title: 'The Pragmatic Programmer' });
  });

  it('moves existing item to front and dedupes', () => {
    (localStorageAdapter.get as ReturnType<typeof vi.fn>).mockReturnValue([
      { isbn: '9780135957059', title: 'Old Title', author: 'Old Author', scannedAt: '2024-01-01' },
    ]);
    addScanHistory({ isbn: '9780135957059', title: 'The Pragmatic Programmer', author: 'Andrew Hunt' });
    const saved = (localStorageAdapter.set as ReturnType<typeof vi.fn>).mock.calls[0][1] as ScanHistoryItem[];
    expect(saved).toHaveLength(1);
    expect(saved[0].title).toBe('The Pragmatic Programmer');
  });

  it('clears history', () => {
    clearScanHistory();
    expect(localStorageAdapter.remove).toHaveBeenCalledWith('scan.coverHistory');
  });
});
