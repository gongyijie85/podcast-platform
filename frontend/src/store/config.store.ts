import { create } from 'zustand';
import type { TtsVoice, BgmTrackDto } from '@shared/book';

interface ConfigState {
  voices: TtsVoice[];
  bgmTracks: BgmTrackDto[];
  recentVoiceIds: string[];
  setVoices: (v: TtsVoice[]) => void;
  setBgm: (b: BgmTrackDto[]) => void;
  pushRecentVoice: (id: string) => void;
}

export const useConfigStore = create<ConfigState>((set) => ({
  voices: [],
  bgmTracks: [],
  recentVoiceIds: [],
  setVoices: (v) => set({ voices: v }),
  setBgm: (b) => set({ bgmTracks: b }),
  pushRecentVoice: (id) =>
    set((state) => {
      const filtered = state.recentVoiceIds.filter((x) => x !== id);
      return { recentVoiceIds: [id, ...filtered].slice(0, 5) };
    }),
}));
