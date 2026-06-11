// Flat config for ESLint v9 (root-level shared rules; per-workspace extends if needed)
export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.vite/**',
      'backend/prisma/migrations/**',
    ],
  },
];
