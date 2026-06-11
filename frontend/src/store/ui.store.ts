import { create } from 'zustand';
import { localStorageAdapter } from '../storage/local-storage.adapter';

export type SnackbarSeverity = 'success' | 'error' | 'info' | 'warning';
export type ThemeMode = 'light' | 'dark';
export type Language = 'zh-CN' | 'en-US';

export interface SnackbarItem {
  id: string;
  message: string;
  severity: SnackbarSeverity;
  duration: number;
}

interface UiState {
  // snackbars
  snackbars: SnackbarItem[];
  push: (message: string, severity?: SnackbarSeverity, duration?: number) => void;
  dismiss: (id: string) => void;
  // drawer / sidebar
  drawerOpen: boolean;
  sidebarCollapsed: boolean;
  setDrawer: (b: boolean) => void;
  setSidebarCollapsed: (b: boolean) => void;
  toggleSidebar: () => void;
  // theme
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
  toggleTheme: () => void;
  // language
  language: Language;
  setLanguage: (l: Language) => void;
}

const THEME_KEY = 'ui.theme';
const LANG_KEY = 'ui.language';
const SIDEBAR_KEY = 'ui.sidebarCollapsed';

const readTheme = (): ThemeMode => {
  const v = localStorageAdapter.get<string>(THEME_KEY);
  return v === 'dark' ? 'dark' : 'light';
};
const readLang = (): Language => {
  const v = localStorageAdapter.get<string>(LANG_KEY);
  return v === 'en-US' ? 'en-US' : 'zh-CN';
};

const applyTheme = (mode: ThemeMode): void => {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', mode);
  document.documentElement.style.colorScheme = mode;
};

const applyLanguage = (lang: Language): void => {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('lang', lang.startsWith('zh') ? 'zh-CN' : 'en');
  try {
    localStorage.setItem('i18n.lang', lang);
  } catch {
    /* ignore */
  }
};

export const useUiStore = create<UiState>((set, get) => ({
  snackbars: [],
  push: (message, severity = 'info', duration = 3000) =>
    set((state) => ({
      snackbars: [
        ...state.snackbars,
        { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, message, severity, duration },
      ],
    })),
  dismiss: (id) =>
    set((state) => ({ snackbars: state.snackbars.filter((s) => s.id !== id) })),

  drawerOpen: false,
  sidebarCollapsed: localStorageAdapter.get<boolean>(SIDEBAR_KEY) === true,
  setDrawer: (b) => set({ drawerOpen: b }),
  setSidebarCollapsed: (b) => {
    localStorageAdapter.set(SIDEBAR_KEY, b);
    set({ sidebarCollapsed: b });
  },
  toggleSidebar: () => {
    const next = !get().sidebarCollapsed;
    localStorageAdapter.set(SIDEBAR_KEY, next);
    set({ sidebarCollapsed: next });
  },

  theme: readTheme(),
  setTheme: (t) => {
    localStorageAdapter.set(THEME_KEY, t);
    applyTheme(t);
    set({ theme: t });
  },
  toggleTheme: () => {
    const next = get().theme === 'light' ? 'dark' : 'light';
    localStorageAdapter.set(THEME_KEY, next);
    applyTheme(next);
    set({ theme: next });
  },

  language: readLang(),
  setLanguage: (l) => {
    localStorageAdapter.set(LANG_KEY, l);
    applyLanguage(l);
    set({ language: l });
  },
}));

// Initial side-effects (run once when this module is first imported).
const initialTheme = readTheme();
applyTheme(initialTheme);
const initialLang = readLang();
applyLanguage(initialLang);
