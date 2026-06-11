import { create } from 'zustand';
import type { ProjectDto, ProjectMode, VoiceConfigDto, BgmConfigDto, GenerationStage } from '@shared/project';

interface ProjectState {
  currentProject: ProjectDto | null;
  step: number;
  progress: number;
  stage: GenerationStage | null;
  statusMessage: string;
  mode: ProjectMode;
  voices: VoiceConfigDto[];
  bgmConfigs: BgmConfigDto[];
  voiceVolume: number;
  subtitleEnabled: boolean;
  isbns: string[];
  scriptText: string;
  setCurrentProject: (p: ProjectDto | null) => void;
  setStep: (n: number) => void;
  setProgress: (n: number) => void;
  setStage: (s: GenerationStage | null) => void;
  setStatusMessage: (m: string) => void;
  setMode: (m: ProjectMode) => void;
  setVoices: (v: VoiceConfigDto[]) => void;
  setBgmConfigs: (b: BgmConfigDto[]) => void;
  setVoiceVolume: (n: number) => void;
  setSubtitleEnabled: (b: boolean) => void;
  setIsbns: (b: string[]) => void;
  setScriptText: (s: string) => void;
  reset: () => void;
  resetWizard: () => void;
}

const initial = {
  currentProject: null,
  step: 1,
  progress: 0,
  stage: null,
  statusMessage: '',
  mode: 'independent' as ProjectMode,
  voices: [] as VoiceConfigDto[],
  bgmConfigs: [] as BgmConfigDto[],
  voiceVolume: 80,
  subtitleEnabled: true,
  isbns: [] as string[],
  scriptText: '',
};

export const useProjectStore = create<ProjectState>((set) => ({
  ...initial,
  setCurrentProject: (p) => set({ currentProject: p }),
  setStep: (n) => set({ step: Math.max(1, Math.min(5, Math.floor(n))) }),
  setProgress: (n) => set({ progress: Math.max(0, Math.min(100, n)) }),
  setStage: (s) => set({ stage: s }),
  setStatusMessage: (m) => set({ statusMessage: m }),
  setMode: (m) => set({ mode: m }),
  setVoices: (v) => set({ voices: v }),
  setBgmConfigs: (b) => set({ bgmConfigs: b }),
  setVoiceVolume: (n) => set({ voiceVolume: Math.max(0, Math.min(100, n)) }),
  setSubtitleEnabled: (b) => set({ subtitleEnabled: b }),
  setIsbns: (b) => set({ isbns: b }),
  setScriptText: (s) => set({ scriptText: s }),
  reset: () => set({ ...initial }),
  resetWizard: () =>
    set({
      step: 1,
      progress: 0,
      stage: null,
      statusMessage: '',
      isbns: [],
      scriptText: '',
      voices: [],
      bgmConfigs: [],
    }),
}));
