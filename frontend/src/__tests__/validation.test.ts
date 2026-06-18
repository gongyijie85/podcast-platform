import { describe, expect, it } from 'vitest';
import { isValidEmail, isValidNicknameLength, isValidPasswordLength } from '../utils/validation';

describe('validation helpers', () => {
  it('validates trimmed email addresses', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail(' user@example.com ')).toBe(true);
    expect(isValidEmail('user.name+tag@example.co.uk')).toBe(true);
  });

  it('rejects invalid email addresses', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('user')).toBe(false);
    expect(isValidEmail('user@')).toBe(false);
    expect(isValidEmail('@example.com')).toBe(false);
    expect(isValidEmail('user@example')).toBe(false);
  });

  it('validates password minimum length', () => {
    expect(isValidPasswordLength('12345')).toBe(false);
    expect(isValidPasswordLength('123456')).toBe(true);
    expect(isValidPasswordLength('abcdef', 8)).toBe(false);
    expect(isValidPasswordLength('abcdefgh', 8)).toBe(true);
  });

  it('validates trimmed nickname length', () => {
    expect(isValidNicknameLength('a')).toBe(false);
    expect(isValidNicknameLength('ab')).toBe(true);
    expect(isValidNicknameLength('  alex  ')).toBe(true);
    expect(isValidNicknameLength('a'.repeat(30))).toBe(true);
    expect(isValidNicknameLength('a'.repeat(31))).toBe(false);
  });
});

