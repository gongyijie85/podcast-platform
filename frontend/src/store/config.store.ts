import { create } from 'zustand';
import type { TtsVoice, BgmTrackDto } from '@shared/book';
import { localStorageAdapter } from '../storage/local-storage.adapter';
import { preferenceApi } from '../api/preference.api';

const PREF_KEY = 'config.preferences';

interface LocalConfigPreferences {
  recentVoiceIds: string[];
  recentBgmTrackIds: string[];
  subtitleStyle: {
    fontSize: number;
    lineHeight: number;
  };
}

interface ConfigState {
  voices: TtsVoice[];
  bgmTracks: BgmTrackDto[];
  recentVoiceIds: string[];
  recentBgmTrackIds: string[];
  subtitleStyle: {
    fontSize: number;
    lineHeight: number;
  };
  setVoices: (v: TtsVoice[]) => void;
  setBgm: (b: BgmTrackDto[]) => void;
  pushRecentVoice: (id: string) => void;
  pushRecentBgm: (id: string) => void;
  setSubtitleStyle: (style: Partial<LocalConfigPreferences['subtitleStyle']>) => void;
  syncPreferences: () => Promise<void>;
}

const readPreferences = (): LocalConfigPreferences =>
  localStorageAdapter.get<LocalConfigPreferences>(PREF_KEY) ?? {
    recentVoiceIds: [],
    recentBgmTrackIds: [],
    subtitleStyle: { fontSize: 16, lineHeight: 1.6 },
  };

const writePreferences = (patch: Partial<LocalConfigPreferences>): void => {
  const current = readPreferences();
  localStorageAdapter.set(PREF_KEY, {
    ...current,
    ...patch,
    subtitleStyle: {
      ...current.subtitleStyle,
      ...(patch.subtitleStyle ?? {}),
    },
  });
};

const initialPrefs = readPreferences();

export const useConfigStore = create<ConfigState>((set) => ({
  voices: [],
  bgmTracks: [],
  recentVoiceIds: initialPrefs.recentVoiceIds,
  recentBgmTrackIds: initialPrefs.recentBgmTrackIds,
  subtitleStyle: initialPrefs.subtitleStyle,
  setVoices: (v) => set({ voices: v }),
  setBgm: (b) => set({ bgmTracks: b }),
  pushRecentVoice: (id) =>
    set((state) => {
      const filtered = state.recentVoiceIds.filter((x) => x !== id);
      const recentVoiceIds = [id, ...filtered].slice(0, 5);
      writePreferences({ recentVoiceIds });
      void preferenceApi.patch({ recentVoiceIds }).catch(() => undefined);
      return { recentVoiceIds };
    }),
  pushRecentBgm: (id) =>
    set((state) => {
      const filtered = state.recentBgmTrackIds.filter((x) => x !== id);
      const recentBgmTrackIds = [id, ...filtered].slice(0, 5);
      writePreferences({ recentBgmTrackIds });
      void preferenceApi.patch({ recentBgmTrackIds }).catch(() => undefined);
      return { recentBgmTrackIds };
    }),
  setSubtitleStyle: (style) =>
    set((state) => {
      const subtitleStyle = { ...state.subtitleStyle, ...style };
      writePreferences({ subtitleStyle });
      void preferenceApi.patch({ subtitleStyle }).catch(() => undefined);
      return { subtitleStyle };
    }),
  syncPreferences: async () => {
    const remote = await preferenceApi.get().catch(() => null);
    if (!remote) return;
    const next: LocalConfigPreferences = {
      recentVoiceIds: remote.recentVoiceIds ?? readPreferences().recentVoiceIds,
      recentBgmTrackIds: remote.recentBgmTrackIds ?? readPreferences().recentBgmTrackIds,
      subtitleStyle: remote.subtitleStyle ?? readPreferences().subtitleStyle,
    };
    writePreferences(next);
    set(next);
  },
}));
