import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { ProgressTimeline } from '../components/progress/ProgressTimeline';
import type { ProgressEvent } from '@shared/job';

const theme = createTheme();

afterEach(() => {
  cleanup();
});

const sampleEvents: ProgressEvent[] = [
  {
    type: 'project.progress',
    projectId: 'p1',
    stage: 'metadata',
    progress: 10,
    message: 'fetched book',
    timestamp: Date.now() - 5000,
    traceId: 't-1',
  },
  {
    type: 'project.progress',
    projectId: 'p1',
    stage: 'script',
    progress: 50,
    message: 'halfway through script',
    timestamp: Date.now(),
    traceId: 't-2',
  },
];

describe('<ProgressTimeline />', () => {
  it('renders the progress percentage', () => {
    render(
      <ThemeProvider theme={theme}>
        <ProgressTimeline
          events={[]}
          currentProgress={42.6}
          currentStage="script"
          currentMessage="working…"
        />
      </ThemeProvider>,
    );
    expect(screen.getByText('43%')).toBeInTheDocument();
  });

  it('clamps the progress bar value to 0..100 (LinearProgress behavior)', () => {
    // Note: the percentage TEXT in the header is `Math.round(currentProgress)` (no clamp);
    // the LinearProgress value IS clamped via Math.max(0, Math.min(100, currentProgress)).
    // We test the LinearProgress DOM attribute here.
    const { container, rerender } = render(
      <ThemeProvider theme={theme}>
        <ProgressTimeline events={[]} currentProgress={-5} currentStage={null} currentMessage="" />
      </ThemeProvider>,
    );
    let bar = container.querySelector('.MuiLinearProgress-bar');
    // bar1Indeterminate false; for determinate, the transform is set inline
    expect(bar?.getAttribute('style') ?? '').toMatch(/translateX\(-?100%\)/);
    rerender(
      <ThemeProvider theme={theme}>
        <ProgressTimeline events={[]} currentProgress={150} currentStage={null} currentMessage="" />
      </ThemeProvider>,
    );
    bar = container.querySelector('.MuiLinearProgress-bar');
    expect(bar?.getAttribute('style') ?? '').toMatch(/translateX\(0%\)/);
  });

  it('rounds fractional progress in the displayed text', () => {
    // The header % is rounded and clamped to 0..100.
    const { container, rerender } = render(
      <ThemeProvider theme={theme}>
        <ProgressTimeline events={[]} currentProgress={42.6} currentStage={null} currentMessage="" />
      </ThemeProvider>,
    );
    expect(within(container as HTMLElement).getByText('43%')).toBeInTheDocument();
    rerender(
      <ThemeProvider theme={theme}>
        <ProgressTimeline events={[]} currentProgress={-5} currentStage={null} currentMessage="" />
      </ThemeProvider>,
    );
    // Negative input is clamped to 0% (not "-5%")
    expect(within(container as HTMLElement).getByText('0%')).toBeInTheDocument();
  });

  it('clamps the header percentage text to 0..100 (progress = -5 displays "0%")', () => {
    render(
      <ThemeProvider theme={theme}>
        <ProgressTimeline events={[]} currentProgress={-5} currentStage={null} currentMessage="" />
      </ThemeProvider>,
    );
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  it('clamps the header percentage text to 0..100 (progress = 150 displays "100%")', () => {
    render(
      <ThemeProvider theme={theme}>
        <ProgressTimeline events={[]} currentProgress={150} currentStage={null} currentMessage="" />
      </ThemeProvider>,
    );
    expect(screen.getByText('100%')).toBeInTheDocument();
  });

  it('LinearProgress value attribute is clamped to 0 when currentProgress = -5', () => {
    // The MUI LinearProgress root element exposes a `aria-valuenow` (0..100)
    // — the same `Math.max(0, Math.min(100, currentProgress))` clamp should
    // turn -5 into 0.
    const { container } = render(
      <ThemeProvider theme={theme}>
        <ProgressTimeline events={[]} currentProgress={-5} currentStage={null} currentMessage="" />
      </ThemeProvider>,
    );
    const progressbar = container.querySelector('[role="progressbar"]') as HTMLElement | null;
    expect(progressbar).not.toBeNull();
    // The bar style is set to `translateX(-100%)` when value=0.
    const bar = container.querySelector('.MuiLinearProgress-bar');
    expect(bar?.getAttribute('style') ?? '').toMatch(/translateX\(-100%\)/);
  });

  it('LinearProgress value attribute is clamped to 100 when currentProgress = 150', () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <ProgressTimeline events={[]} currentProgress={150} currentStage={null} currentMessage="" />
      </ThemeProvider>,
    );
    const bar = container.querySelector('.MuiLinearProgress-bar');
    // The bar style is set to `translateX(0%)` when value=100 (bar fully visible).
    expect(bar?.getAttribute('style') ?? '').toMatch(/translateX\(0%\)/);
  });

  it('renders the current message', () => {
    render(
      <ThemeProvider theme={theme}>
        <ProgressTimeline
          events={[]}
          currentProgress={50}
          currentStage="tts"
          currentMessage="合成语音中…"
        />
      </ThemeProvider>,
    );
    expect(screen.getByText('合成语音中…')).toBeInTheDocument();
  });

  it('falls back to "等待中…" when no current message', () => {
    render(
      <ThemeProvider theme={theme}>
        <ProgressTimeline events={[]} currentProgress={0} currentStage={null} currentMessage="" />
      </ThemeProvider>,
    );
    expect(screen.getByText('等待中…')).toBeInTheDocument();
  });

  it('shows the current stage chip when currentStage is set', () => {
    render(
      <ThemeProvider theme={theme}>
        <ProgressTimeline
          events={[]}
          currentProgress={10}
          currentStage="metadata"
          currentMessage=""
        />
      </ThemeProvider>,
    );
    // The "metadata" stage label "拉取书籍信息" appears in two places:
    // 1) the current-stage chip in the header
    // 2) the stage label in the pipeline list
    // We just need to confirm at least one is rendered.
    expect(screen.getAllByText('拉取书籍信息').length).toBeGreaterThanOrEqual(1);
  });

  it('renders an event log when events array is non-empty', () => {
    render(
      <ThemeProvider theme={theme}>
        <ProgressTimeline
          events={sampleEvents}
          currentProgress={50}
          currentStage="script"
          currentMessage=""
        />
      </ThemeProvider>,
    );
    expect(screen.getByText('事件日志')).toBeInTheDocument();
    expect(screen.getByText('fetched book')).toBeInTheDocument();
    expect(screen.getByText('halfway through script')).toBeInTheDocument();
  });

  it('does NOT render the event log when events is empty', () => {
    render(
      <ThemeProvider theme={theme}>
        <ProgressTimeline events={[]} currentProgress={0} currentStage={null} currentMessage="" />
      </ThemeProvider>,
    );
    expect(screen.queryByText('事件日志')).not.toBeInTheDocument();
  });

  it('shows the "完成" marker for stages before the current one', () => {
    render(
      <ThemeProvider theme={theme}>
        <ProgressTimeline
          events={[]}
          currentProgress={60}
          currentStage="tts"
          currentMessage=""
        />
      </ThemeProvider>,
    );
    // metadata + script are done before tts
    const completedLabels = screen.getAllByText('完成');
    expect(completedLabels.length).toBe(2);
  });

  it('shows the "进行中" marker for the current stage', () => {
    render(
      <ThemeProvider theme={theme}>
        <ProgressTimeline
          events={[]}
          currentProgress={50}
          currentStage="script"
          currentMessage=""
        />
      </ThemeProvider>,
    );
    expect(screen.getByText('进行中')).toBeInTheDocument();
  });

  it('shows estimated remaining time when provided', () => {
    render(
      <ThemeProvider theme={theme}>
        <ProgressTimeline
          events={[]}
          currentProgress={50}
          currentStage="tts"
          currentMessage=""
          estimatedRemainingMs={2 * 60 * 1000 + 15 * 1000}
        />
      </ThemeProvider>,
    );
    expect(screen.getByText(/预计 02:15/)).toBeInTheDocument();
  });
});
