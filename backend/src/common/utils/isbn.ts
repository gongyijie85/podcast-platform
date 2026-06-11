/**
 * ISBN normalization & check-digit validation.
 * Supports both 10-digit and 13-digit ISBNs.
 */
export function normalizeIsbn(input: string): string | null {
  if (!input) return null;
  const cleaned = input.replace(/[-\s]/g, '').toUpperCase();
  if (cleaned.length === 10) {
    return isValidIsbn10(cleaned) ? cleaned : null;
  }
  if (cleaned.length === 13) {
    return isValidIsbn13(cleaned) ? cleaned : null;
  }
  return null;
}

export function isValidIsbn10(isbn: string): boolean {
  if (!/^\d{9}[\dX]$/.test(isbn)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += (i + 1) * parseInt(isbn[i], 10);
  }
  const checkChar = isbn[9];
  const checkDigit = checkChar === 'X' ? 10 : parseInt(checkChar, 10);
  sum += 10 * checkDigit;
  return sum % 11 === 0;
}

export function isValidIsbn13(isbn: string): boolean {
  if (!/^\d{13}$/.test(isbn)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(isbn[i], 10);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === parseInt(isbn[12], 10);
}

export function isbnToIsbn13(isbn10: string): string | null {
  if (!isValidIsbn10(isbn10)) return null;
  const core = '978' + isbn10.slice(0, 9);
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(core[i], 10);
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  const check = (10 - (sum % 10)) % 10;
  return core + check.toString();
}
