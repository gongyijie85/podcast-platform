import { describe, it, expect } from 'vitest';
import {
  formatMs,
  formatTime,
  formatPercent,
  formatBytes,
} from '../utils/format';

describe('formatMs', () => {
  it('formats zero as 00:00', () => {
    expect(formatMs(0)).toBe('00:00');
  });
  it('formats sub-seconds as 00:00', () => {
    expect(formatMs(500)).toBe('00:00');
  });
  it('pads single-digit seconds', () => {
    expect(formatMs(5_000)).toBe('00:05');
  });
  it('formats minutes and seconds', () => {
    expect(formatMs(75_000)).toBe('01:15');
  });
  it('clamps negative values to zero', () => {
    expect(formatMs(-100)).toBe('00:00');
  });
  it('formats large values', () => {
    expect(formatMs(3_661_000)).toBe('61:01');
  });
  it('rounds down fractional seconds', () => {
    expect(formatMs(1999)).toBe('00:01');
  });
});

describe('formatTime', () => {
  it('formats ISO date as YYYY-MM-DD HH:mm', () => {
    const iso = '2024-05-01T09:05:00Z';
    // Allow any timezone; just check the shape
    expect(formatTime(iso)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });
  it('accepts a Date object', () => {
    const d = new Date('2024-12-31T23:59:00Z');
    expect(formatTime(d)).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });
});

describe('formatPercent', () => {
  it('returns "0%" for negative numbers', () => {
    expect(formatPercent(-10)).toBe('0%');
  });
  it('returns "100%" for >100', () => {
    expect(formatPercent(150)).toBe('100%');
  });
  it('rounds to integer', () => {
    expect(formatPercent(45.6)).toBe('46%');
  });
  it('formats 0 correctly', () => {
    expect(formatPercent(0)).toBe('0%');
  });
  it('formats 100 correctly', () => {
    expect(formatPercent(100)).toBe('100%');
  });
});

describe('formatBytes', () => {
  it('formats sub-KB as B', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
  });
  it('formats KB', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });
  it('formats MB', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.00 MB');
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.50 MB');
  });
});
