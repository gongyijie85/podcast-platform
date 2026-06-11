/**
 * CJS shim for the ESM-only `nanoid@5` package.
 *
 * Jest's transformer pipeline refuses to compile `node_modules` (and we don't
 * want to flip `allowJs` on either, because that breaks `@nestjs/*` packages
 * which rely on `Object.defineProperty` getters that get mangled by ts-jest).
 *
 * The shim exposes a tiny subset of `nanoid`'s API — enough for our usage in
 * `AuthService` (`nanoid()` returns a 21-char URL-safe id). It uses Node's
 * built-in `crypto.randomBytes` for entropy, which is good enough for unique
 * identifiers inside test runs.
 *
 * If a future spec needs `customAlphabet` or the `non-secure` variant, extend
 * the exports here.
 */
'use strict';

const { randomBytes } = require('node:crypto');

const ALPHABET =
  'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';

/**
 * @param {number} [size=21] desired id length
 * @returns {string} URL-safe id of the requested size
 */
function nanoid(size = 21) {
  const n = size | 0;
  const bytes = randomBytes(n);
  let id = '';
  for (let i = 0; i < n; i++) {
    id += ALPHABET[63 & bytes[i]];
  }
  return id;
}

/**
 * Drop-in for `nanoid/non-secure` (no `crypto.randomBytes`).
 * Deterministic-enough for tests that do not need cryptographic entropy.
 */
const nonSecure = nanoid;

module.exports = nanoid;
module.exports.nanoid = nanoid;
module.exports.default = nanoid;
module.exports.nonSecure = nonSecure;
