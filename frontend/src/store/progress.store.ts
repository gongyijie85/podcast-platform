import { create } from 'zustand';
import type { GenerationStage } from '@shared/project';

interface ProgressState {
  projectId: string | null;
  stage: GenerationStage | null;
  progress: number;
  message: string;
  start: (projectId: string) => void;
  setEvent: (stage: GenerationStage, progress: number, message: string) => void;
  reset: () => void;
}

export const useProgressStore = create<ProgressState>((set) => ({
  projectId: null,
  stage: null,
  progress: 0,
  message: '',
  start: (projectId) => set({ projectId, progress: 0, stage: 'metadata', message: '...' }),
  setEvent: (stage, progress, message) => set({ stage, progress, message }),
  reset: () => set({ projectId: null, stage: null, progress: 0, message: '' }),
}));
