import type { Config } from 'jest';

/**
 * Jest configuration for backend unit tests.
 *
 * Strategy for ESM-only `nanoid@5`:
 * - We CANNOT simply put nanoid into `transformIgnorePatterns` because nanoid@5
 *   ships pure ESM (`import { webcrypto } from 'node:crypto'`) and ts-jest
 *   would still emit CJS — but the transform pipeline must also not touch
 *   already-CJS packages like `@nestjs/*` (they use `Object.defineProperty`
 *   getters and re-compiling them triggers infinite recursion in Nest's DI).
 * - Instead we route every `import 'nanoid'` (and `nanoid/non-secure`) through
 *   `moduleNameMapper` to a CJS shim we own. The shim is a 30-line file that
 *   mimics nanoid's API using `crypto.randomBytes`. The shim is wired in BOTH
 *   `jest.config.ts` and `test/jest-e2e.json` so the e2e suite benefits too.
 * - `transformIgnorePatterns` is restored to jest's default of skipping all of
 *   `node_modules` (no `allowJs`, no compiled-output for vendor code).
 */
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '\\.(spec|e2e-spec)\\.ts$',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          baseUrl: '.',
          paths: {
            '@/*': ['src/*'],
            '@shared/*': ['../shared/types/*'],
          },
        },
        isolatedModules: true,
      },
    ],
  },
  moduleNameMapper: {
    '^@shared/(.*)$': '<rootDir>/../shared/types/$1',
    // Force every import of `nanoid` (including sub-paths) to our CJS shim
    // so jest never has to parse the ESM-only `nanoid@5` distribution.
    '^nanoid$': '<rootDir>/test/__mocks__/nanoid.cjs',
    '^nanoid/non-secure$': '<rootDir>/test/__mocks__/nanoid.cjs',
  },
  transformIgnorePatterns: ['/node_modules/', '\\.pnp\\.[^\\/]+$'],
  clearMocks: true,
};

export default config;
