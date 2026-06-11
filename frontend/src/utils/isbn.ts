/**
 * ISBN-10 / ISBN-13 validation with check-digit algorithm.
 */
export function normalizeIsbn(input: string): string | null {
  if (!input) return null;
  const cleaned = input.replace(/[-\s]/g, '').toUpperCase();
  if (cleaned.length === 10) return isValidIsbn10(cleaned) ? cleaned : null;
  if (cleaned.length === 13) return isValidIsbn13(cleaned) ? cleaned : null;
  return null;
}

export function isValidIsbn10(isbn: string): boolean {
  if (!/^\d{9}[\dX]$/.test(isbn)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (i + 1) * parseInt(isbn[i], 10);
  const check = isbn[9] === 'X' ? 10 : parseInt(isbn[9], 10);
  sum += 10 * check;
  return sum % 11 === 0;
}

export function isValidIsbn13(isbn: string): boolean {
  if (!/^\d{13}$/.test(isbn)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = parseInt(isbn[i], 10);
    sum += i % 2 === 0 ? d : d * 3;
  }
  const check = (10 - (sum % 10)) % 10;
  return check === parseInt(isbn[12], 10);
}

/** Parse input string into a list of ISBN candidates, marking invalid ones. */
export interface IsbnParseResult {
  isbn: string;
  valid: boolean;
  reason?: string;
}

export function parseIsbnInput(text: string): IsbnParseResult[] {
  if (!text) return [];
  const tokens = text
    .split(/[\s,;\n\r\t]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  return tokens.map((t) => {
    const cleaned = t.replace(/[-\s]/g, '').toUpperCase();
    if (!/^[\dX]+$/.test(cleaned)) {
      return { isbn: t, valid: false, reason: '包含非数字字符' };
    }
    if (cleaned.length !== 10 && cleaned.length !== 13) {
      return { isbn: t, valid: false, reason: `位数错 (${cleaned.length})` };
    }
    if (cleaned.length === 10 && !isValidIsbn10(cleaned)) {
      return { isbn: t, valid: false, reason: 'ISBN-10 校验位错误' };
    }
    if (cleaned.length === 13 && !isValidIsbn13(cleaned)) {
      return { isbn: t, valid: false, reason: 'ISBN-13 校验位错误' };
    }
    return { isbn: cleaned, valid: true };
  });
}
