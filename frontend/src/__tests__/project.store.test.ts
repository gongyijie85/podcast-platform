import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../store/project.store';

const makeVoice = (overrides = {}) => ({
  id: 'v1',
  projectId: 'p1',
  role: 'host' as const,
  voiceId: 'BV001',
  provider: 'volcengine' as const,
  ...overrides,
});

const makeBgm = (overrides = {}) => ({
  id: 'b1',
  projectId: 'p1',
  segment: 'intro' as const,
  bgmTrackId: 'bgm-1',
  volume: 50,
  fadeInMs: 1000,
  fadeOutMs: 1000,
  ...overrides,
});

describe('useProjectStore', () => {
  beforeEach(() => {
    useProjectStore.setState({
      currentProject: null,
      step: 1,
      progress: 0,
      stage: null,
      statusMessage: '',
      mode: 'independent',
      voices: [],
      bgmConfigs: [],
      voiceVolume: 80,
      subtitleEnabled: true,
      isbns: [],
      scriptText: '',
    });
  });

  describe('initial state', () => {
    it('starts at step 1', () => {
      expect(useProjectStore.getState().step).toBe(1);
    });
    it('starts in independent mode', () => {
      expect(useProjectStore.getState().mode).toBe('independent');
    });
    it('voiceVolume defaults to 80', () => {
      expect(useProjectStore.getState().voiceVolume).toBe(80);
    });
    it('subtitleEnabled defaults to true', () => {
      expect(useProjectStore.getState().subtitleEnabled).toBe(true);
    });
  });

  describe('wizard step', () => {
    it('setStep clamps to range 1..5', () => {
      useProjectStore.getState().setStep(0);
      expect(useProjectStore.getState().step).toBe(1);
      useProjectStore.getState().setStep(3);
      expect(useProjectStore.getState().step).toBe(3);
      useProjectStore.getState().setStep(99);
      expect(useProjectStore.getState().step).toBe(5);
      useProjectStore.getState().setStep(-7);
      expect(useProjectStore.getState().step).toBe(1);
    });
    it('setStep floors fractional values', () => {
      useProjectStore.getState().setStep(2.9);
      expect(useProjectStore.getState().step).toBe(2);
    });
  });

  describe('progress', () => {
    it('setProgress clamps to 0..100', () => {
      useProjectStore.getState().setProgress(-10);
      expect(useProjectStore.getState().progress).toBe(0);
      useProjectStore.getState().setProgress(50);
      expect(useProjectStore.getState().progress).toBe(50);
      useProjectStore.getState().setProgress(150);
      expect(useProjectStore.getState().progress).toBe(100);
    });
  });

  describe('voiceVolume', () => {
    it('clamps to 0..100', () => {
      useProjectStore.getState().setVoiceVolume(-1);
      expect(useProjectStore.getState().voiceVolume).toBe(0);
      useProjectStore.getState().setVoiceVolume(50);
      expect(useProjectStore.getState().voiceVolume).toBe(50);
      useProjectStore.getState().setVoiceVolume(101);
      expect(useProjectStore.getState().voiceVolume).toBe(100);
    });
  });

  describe('voices & bgmConfigs', () => {
    it('setVoices replaces the list', () => {
      useProjectStore.getState().setVoices([makeVoice({ voiceId: 'a' })]);
      expect(useProjectStore.getState().voices).toHaveLength(1);
      useProjectStore.getState().setVoices([makeVoice({ voiceId: 'a' }), makeVoice({ voiceId: 'b' })]);
      expect(useProjectStore.getState().voices).toHaveLength(2);
    });
    it('setBgmConfigs replaces the list', () => {
      useProjectStore.getState().setBgmConfigs([makeBgm(), makeBgm({ segment: 'body' })]);
      expect(useProjectStore.getState().bgmConfigs).toHaveLength(2);
    });
  });

  describe('reset() vs resetWizard()', () => {
    it('reset() restores ALL fields to initial', () => {
      useProjectStore.setState({
        currentProject: { id: 'p1' } as never,
        step: 5,
        progress: 90,
        stage: 'mix' as never,
        statusMessage: 'mixing',
        mode: 'merged',
        voices: [makeVoice()],
        bgmConfigs: [makeBgm()],
        voiceVolume: 30,
        subtitleEnabled: false,
        isbns: ['9787121362200'],
        scriptText: 'hello',
      });
      useProjectStore.getState().reset();
      const s = useProjectStore.getState();
      expect(s.currentProject).toBeNull();
      expect(s.step).toBe(1);
      expect(s.progress).toBe(0);
      expect(s.stage).toBeNull();
      expect(s.statusMessage).toBe('');
      expect(s.mode).toBe('independent');
      expect(s.voices).toEqual([]);
      expect(s.bgmConfigs).toEqual([]);
      expect(s.voiceVolume).toBe(80);
      expect(s.subtitleEnabled).toBe(true);
      expect(s.isbns).toEqual([]);
      expect(s.scriptText).toBe('');
    });

    it('resetWizard() keeps currentProject, voiceVolume, subtitleEnabled, mode', () => {
      useProjectStore.setState({
        currentProject: { id: 'p1' } as never,
        step: 5,
        progress: 90,
        stage: 'mix' as never,
        statusMessage: 'mixing',
        mode: 'merged',
        voices: [makeVoice()],
        bgmConfigs: [makeBgm()],
        voiceVolume: 30,
        subtitleEnabled: false,
        isbns: ['9787121362200'],
        scriptText: 'hello',
      });
      useProjectStore.getState().resetWizard();
      const s = useProjectStore.getState();
      // Cleared
      expect(s.step).toBe(1);
      expect(s.progress).toBe(0);
      expect(s.stage).toBeNull();
      expect(s.statusMessage).toBe('');
      expect(s.isbns).toEqual([]);
      expect(s.scriptText).toBe('');
      expect(s.voices).toEqual([]);
      expect(s.bgmConfigs).toEqual([]);
      // Preserved
      expect(s.currentProject).toEqual({ id: 'p1' });
      expect(s.voiceVolume).toBe(30);
      expect(s.subtitleEnabled).toBe(false);
      expect(s.mode).toBe('merged');
    });
  });

  describe('setMode / setStage / setStatusMessage / setIsbns / setScriptText / setSubtitleEnabled', () => {
    it('setMode updates mode', () => {
      useProjectStore.getState().setMode('merged');
      expect(useProjectStore.getState().mode).toBe('merged');
    });
    it('setStage sets and clears stage', () => {
      useProjectStore.getState().setStage('script' as never);
      expect(useProjectStore.getState().stage).toBe('script');
      useProjectStore.getState().setStage(null);
      expect(useProjectStore.getState().stage).toBeNull();
    });
    it('setStatusMessage updates status text', () => {
      useProjectStore.getState().setStatusMessage('generating…');
      expect(useProjectStore.getState().statusMessage).toBe('generating…');
    });
    it('setIsbns replaces isbns list', () => {
      useProjectStore.getState().setIsbns(['9787121362200']);
      expect(useProjectStore.getState().isbns).toEqual(['9787121362200']);
    });
    it('setScriptText replaces script text', () => {
      useProjectStore.getState().setScriptText('hi');
      expect(useProjectStore.getState().scriptText).toBe('hi');
    });
    it('setSubtitleEnabled toggles', () => {
      useProjectStore.getState().setSubtitleEnabled(false);
      expect(useProjectStore.getState().subtitleEnabled).toBe(false);
    });
  });
});
