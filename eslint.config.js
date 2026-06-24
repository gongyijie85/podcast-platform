// Flat config for ESLint v9 (root-level shared rules; per-workspace extends if needed)
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.vite/**',
      'backend/prisma/migrations/**',
      'shared/types/**/*.js',
      'shared/types/**/*.js.map',
    ],
  },
  // 启用 typescript-eslint 推荐规则集，覆盖所有 .ts/.tsx 文件
  ...tseslint.configs.recommended,
);
