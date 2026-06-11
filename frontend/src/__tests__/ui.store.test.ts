import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useUiStore } from '../store/ui.store';
import { localStorageAdapter } from '../storage/local-storage.adapter';

describe('useUiStore', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('lang');
    // Reset store to initial state
    useUiStore.setState({
      snackbars: [],
      drawerOpen: false,
      sidebarCollapsed: false,
      theme: 'light',
      language: 'zh-CN',
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('snackbars', () => {
    it('push adds a snackbar with default severity/duration', () => {
      useUiStore.getState().push('hi');
      const s = useUiStore.getState().snackbars;
      expect(s).toHaveLength(1);
      expect(s[0].message).toBe('hi');
      expect(s[0].severity).toBe('info');
      expect(s[0].duration).toBe(3000);
      expect(typeof s[0].id).toBe('string');
    });

    it('push accepts severity and duration', () => {
      useUiStore.getState().push('err', 'error', 1000);
      const s = useUiStore.getState().snackbars;
      expect(s[0].severity).toBe('error');
      expect(s[0].duration).toBe(1000);
    });

    it('push appends multiple snackbars with unique ids', () => {
      useUiStore.getState().push('a');
      useUiStore.getState().push('b');
      const s = useUiStore.getState().snackbars;
      expect(s).toHaveLength(2);
      expect(s[0].id).not.toBe(s[1].id);
    });

    it('dismiss removes by id', () => {
      useUiStore.getState().push('x');
      useUiStore.getState().push('y');
      const id = useUiStore.getState().snackbars[0].id;
      useUiStore.getState().dismiss(id);
      const remaining = useUiStore.getState().snackbars;
      expect(remaining).toHaveLength(1);
      expect(remaining[0].message).toBe('y');
    });
  });

  describe('theme', () => {
    it('setTheme updates theme and applies data-theme attribute', () => {
      useUiStore.getState().setTheme('dark');
      expect(useUiStore.getState().theme).toBe('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    it('setTheme persists to localStorage', () => {
      useUiStore.getState().setTheme('dark');
      const stored = localStorageAdapter.get<string>('ui.theme');
      expect(stored).toBe('dark');
    });

    it('toggleTheme switches light<->dark and applies attribute', () => {
      useUiStore.setState({ theme: 'light' });
      useUiStore.getState().toggleTheme();
      expect(useUiStore.getState().theme).toBe('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      useUiStore.getState().toggleTheme();
      expect(useUiStore.getState().theme).toBe('light');
    });
  });

  describe('language', () => {
    it('setLanguage updates language and applies lang attribute', () => {
      useUiStore.getState().setLanguage('en-US');
      expect(useUiStore.getState().language).toBe('en-US');
      expect(document.documentElement.getAttribute('lang')).toBe('en');
    });

    it('setLanguage persists to localStorage', () => {
      useUiStore.getState().setLanguage('en-US');
      expect(localStorageAdapter.get<string>('ui.language')).toBe('en-US');
    });

    it('setLanguage to zh-CN sets lang=zh-CN', () => {
      useUiStore.getState().setLanguage('zh-CN');
      expect(document.documentElement.getAttribute('lang')).toBe('zh-CN');
    });
  });

  describe('drawer & sidebar', () => {
    it('setDrawer opens/closes drawer', () => {
      useUiStore.getState().setDrawer(true);
      expect(useUiStore.getState().drawerOpen).toBe(true);
      useUiStore.getState().setDrawer(false);
      expect(useUiStore.getState().drawerOpen).toBe(false);
    });

    it('setSidebarCollapsed persists and updates state', () => {
      useUiStore.getState().setSidebarCollapsed(true);
      expect(useUiStore.getState().sidebarCollapsed).toBe(true);
      expect(localStorageAdapter.get<boolean>('ui.sidebarCollapsed')).toBe(true);
    });

    it('toggleSidebar flips state and persists', () => {
      useUiStore.setState({ sidebarCollapsed: false });
      useUiStore.getState().toggleSidebar();
      expect(useUiStore.getState().sidebarCollapsed).toBe(true);
      expect(localStorageAdapter.get<boolean>('ui.sidebarCollapsed')).toBe(true);
    });
  });
});
