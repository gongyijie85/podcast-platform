import { describe, it, expect } from 'vitest';
import {
  isValidIsbn10,
  isValidIsbn10 as _iv10,
  isValidIsbn13,
  normalizeIsbn,
  parseIsbnInput,
} from '../utils/isbn';

// Real valid ISBNs for testing:
// ISBN-10: 0306406152 (checksum 2)
// ISBN-13: 9787121362200
// Another ISBN-13: 9787544253994

describe('isValidIsbn10', () => {
  it('accepts a valid ISBN-10', () => {
    expect(isValidIsbn10('0306406152')).toBe(true);
  });
  it('rejects wrong length', () => {
    expect(isValidIsbn10('123')).toBe(false);
  });
  it('rejects non-digit characters (except final X)', () => {
    expect(isValidIsbn10('030640615X')).toBe(false); // checksum off
  });
  it('accepts a valid ISBN-10 ending in X', () => {
    // ISBN-10 155404295X is a well-known valid sample
    expect(isValidIsbn10('155404295X')).toBe(true);
  });
  it('rejects bad checksum', () => {
    expect(isValidIsbn10('0306406153')).toBe(false);
  });
});

describe('isValidIsbn13', () => {
  it('accepts a valid ISBN-13', () => {
    expect(isValidIsbn13('9787121362200')).toBe(true);
  });
  it('rejects wrong length', () => {
    expect(isValidIsbn13('123')).toBe(false);
  });
  it('rejects non-digit characters', () => {
    expect(isValidIsbn13('978712136220X')).toBe(false);
  });
  it('rejects bad checksum', () => {
    expect(isValidIsbn13('9787121362201')).toBe(false);
  });
});

describe('normalizeIsbn', () => {
  it('returns null for empty input', () => {
    expect(normalizeIsbn('')).toBeNull();
  });
  it('normalizes a 13-digit ISBN with hyphens', () => {
    expect(normalizeIsbn('978-7-121-36220-0')).toBe('9787121362200');
  });
  it('normalizes compact publisher hyphen ISBNs', () => {
    expect(normalizeIsbn('978-0241662151')).toBe('9780241662151');
  });
  it('normalizes a 13-digit ISBN with spaces', () => {
    expect(normalizeIsbn(' 9787121362200 ')).toBe('9787121362200');
  });
  it('normalizes a 10-digit ISBN', () => {
    expect(normalizeIsbn('0-306-40615-2')).toBe('0306406152');
  });
  it('returns null for invalid ISBN', () => {
    expect(normalizeIsbn('1234567890')).toBeNull();
  });
  it('returns null for wrong length', () => {
    expect(normalizeIsbn('12345')).toBeNull();
  });
  it('uppercases X', () => {
    expect(normalizeIsbn('155404295x')).toBe('155404295X');
  });
});

describe('parseIsbnInput', () => {
  it('returns [] for empty input', () => {
    expect(parseIsbnInput('')).toEqual([]);
  });
  it('parses a single valid 13-digit ISBN', () => {
    const r = parseIsbnInput('9787121362200');
    expect(r).toHaveLength(1);
    expect(r[0].valid).toBe(true);
    expect(r[0].isbn).toBe('9787121362200');
  });
  it('parses a hyphenated ISBN-13 as one token', () => {
    const r = parseIsbnInput('978-0241662151');
    expect(r).toEqual([{ isbn: '9780241662151', valid: true }]);
  });
  it('parses comma-separated ISBNs', () => {
    const r = parseIsbnInput('9787121362200, 9787544253994');
    expect(r).toHaveLength(2);
    expect(r.every((x) => x.valid)).toBe(true);
  });
  it('parses newline-separated ISBNs', () => {
    const r = parseIsbnInput('9787121362200\n9787544253994');
    expect(r).toHaveLength(2);
    expect(r.every((x) => x.valid)).toBe(true);
  });
  it('marks invalid ISBNs with reason', () => {
    const r = parseIsbnInput('abc');
    expect(r[0].valid).toBe(false);
    expect(r[0].reason).toBeDefined();
  });
  it('rejects wrong-length ISBNs with 位数错 reason', () => {
    const r = parseIsbnInput('12345');
    expect(r[0].valid).toBe(false);
    expect(r[0].reason).toContain('位数错');
  });
  it('flags ISBN-10 with bad checksum', () => {
    const r = parseIsbnInput('0306406153');
    expect(r[0].valid).toBe(false);
    expect(r[0].reason).toContain('ISBN-10');
  });
  it('flags ISBN-13 with bad checksum', () => {
    const r = parseIsbnInput('9787121362201');
    expect(r[0].valid).toBe(false);
    expect(r[0].reason).toContain('ISBN-13');
  });
});
