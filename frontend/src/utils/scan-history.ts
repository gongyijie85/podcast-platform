import { localStorageAdapter } from '@/storage/local-storage.adapter';
import type { CoverRecognizeCandidate } from '@/api/book.api';

const HISTORY_KEY = 'scan.coverHistory';
const MAX_HISTORY = 20;

export interface ScanHistoryItem {
  isbn: string;
  title: string;
  author: string;
  coverUrl?: string | null;
  scannedAt: string;
}

function toHistoryItem(book: CoverRecognizeCandidate): ScanHistoryItem {
  return {
    isbn: book.isbn,
    title: book.title,
    author: book.author,
    coverUrl: book.coverUrl,
    scannedAt: new Date().toISOString(),
  };
}

export function getScanHistory(): ScanHistoryItem[] {
  return localStorageAdapter.get<ScanHistoryItem[]>(HISTORY_KEY) ?? [];
}

export function addScanHistory(book: CoverRecognizeCandidate): void {
  const history = getScanHistory();
  const filtered = history.filter((item) => item.isbn !== book.isbn);
  const next = [toHistoryItem(book), ...filtered].slice(0, MAX_HISTORY);
  localStorageAdapter.set(HISTORY_KEY, next);
}

export function clearScanHistory(): void {
  localStorageAdapter.remove(HISTORY_KEY);
}
