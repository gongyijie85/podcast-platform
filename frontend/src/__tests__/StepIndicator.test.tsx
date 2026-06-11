import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { StepIndicator } from '../components/progress/StepIndicator';

// Mock the mobile hook so we always render desktop layout
vi.mock('../hooks/useMediaQuery', () => ({
  useMobile: () => false,
  useTablet: () => false,
  useDesktop: () => true,
}));

const theme = createTheme();

const STEPS = [
  { key: 'book', label: '选书' },
  { key: 'script', label: '脚本' },
  { key: 'voice', label: '音色' },
  { key: 'bgm', label: 'BGM' },
  { key: 'mix', label: '合成' },
];

describe('<StepIndicator />', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders all step labels', () => {
    render(
      <ThemeProvider theme={theme}>
        <StepIndicator steps={STEPS} current={1} />
      </ThemeProvider>,
    );
    STEPS.forEach((s) => {
      expect(screen.getByText(s.label)).toBeInTheDocument();
    });
  });

  it('exposes a role=progressbar with aria-valuenow on desktop', () => {
    render(
      <ThemeProvider theme={theme}>
        <StepIndicator steps={STEPS} current={3} />
      </ThemeProvider>,
    );
    const bar = screen.getByRole('progressbar');
    expect(bar).toBeInTheDocument();
    expect(bar.getAttribute('aria-valuenow')).toBe('3');
    expect(bar.getAttribute('aria-valuemin')).toBe('1');
    expect(bar.getAttribute('aria-valuemax')).toBe('5');
  });

  it('clamps current to [1, steps.length]', () => {
    const { rerender } = render(
      <ThemeProvider theme={theme}>
        <StepIndicator steps={STEPS} current={-5} />
      </ThemeProvider>,
    );
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('1');
    rerender(
      <ThemeProvider theme={theme}>
        <StepIndicator steps={STEPS} current={99} />
      </ThemeProvider>,
    );
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('5');
  });

  it('floors fractional current values', () => {
    render(
      <ThemeProvider theme={theme}>
        <StepIndicator steps={STEPS} current={2.7} />
      </ThemeProvider>,
    );
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('2');
  });

  it('renders a check icon for done steps', () => {
    render(
      <ThemeProvider theme={theme}>
        <StepIndicator steps={STEPS} current={3} />
      </ThemeProvider>,
    );
    // Steps 1 and 2 are "done" (idx < safeCurrent=3)
    const checks = document.querySelectorAll('.MuiSvgIcon-root[data-testid="CheckIcon"]');
    expect(checks.length).toBe(2);
  });
});
