import { create } from 'zustand';
import type { BookMetadata } from '@shared/book';
import type { IsbnParseResult } from '../utils/isbn';

interface BooksState {
  raw: string;
  parsed: IsbnParseResult[];
  results: Record<string, BookMetadata | { error: string }>;
  loading: boolean;
  setRaw: (s: string) => void;
  setParsed: (p: IsbnParseResult[]) => void;
  setResult: (isbn: string, r: BookMetadata | { error: string }) => void;
  setLoading: (b: boolean) => void;
  reset: () => void;
}

export const useBooksStore = create<BooksState>((set) => ({
  raw: '',
  parsed: [],
  results: {},
  loading: false,
  setRaw: (s) => set({ raw: s }),
  setParsed: (p) => set({ parsed: p }),
  setResult: (isbn, r) =>
    set((state) => ({ results: { ...state.results, [isbn]: r } })),
  setLoading: (b) => set({ loading: b }),
  reset: () => set({ raw: '', parsed: [], results: {}, loading: false }),
}));
