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
  // elder mode (长辈模式：放大字号，提高对比度)
  elderMode: boolean;
  setElderMode: (b: boolean) => void;
  toggleElderMode: () => void;
}

const THEME_KEY = 'ui.theme';
const LANG_KEY = 'ui.language';
const SIDEBAR_KEY = 'ui.sidebarCollapsed';
const ELDER_KEY = 'ui.elderMode';

const readTheme = (): ThemeMode => {
  const v = localStorageAdapter.get<string>(THEME_KEY);
  return v === 'dark' ? 'dark' : 'light';
};
const readLang = (): Language => {
  const v = localStorageAdapter.get<string>(LANG_KEY);
  return v === 'en-US' ? 'en-US' : 'zh-CN';
};
const readElder = (): boolean => localStorageAdapter.get<boolean>(ELDER_KEY) === true;

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

const applyElderMode = (on: boolean): void => {
  if (typeof document === 'undefined') return;
  // 字号放大 25%（1.25），MUI typography 基于 rem 会自动跟随
  document.documentElement.style.setProperty('--font-scale', on ? '1.25' : '1');
  document.documentElement.setAttribute('data-elder-mode', on ? 'on' : 'off');
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

  elderMode: readElder(),
  setElderMode: (b) => {
    localStorageAdapter.set(ELDER_KEY, b);
    applyElderMode(b);
    set({ elderMode: b });
  },
  toggleElderMode: () => {
    const next = !get().elderMode;
    localStorageAdapter.set(ELDER_KEY, next);
    applyElderMode(next);
    set({ elderMode: next });
  },
}));

// Initial side-effects (run once when this module is first imported).
const initialTheme = readTheme();
applyTheme(initialTheme);
const initialLang = readLang();
applyLanguage(initialLang);
const initialElder = readElder();
applyElderMode(initialElder);
