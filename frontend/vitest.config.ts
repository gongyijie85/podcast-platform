import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { createRequire } from 'node:module';

// 通过 @testing-library/react 的解析上下文找到 React 的真实安装路径，
// 避免 pnpm workspace 中测试代码与 react-dom 引用到不同物理路径的 React，
// 导致 hook dispatcher 为 null 的 "Cannot read properties of null (reading 'useState')" 错误。
const require = createRequire(import.meta.url);
const testingLibraryPkg = require.resolve('@testing-library/react/package.json');
const rtlRequire = createRequire(testingLibraryPkg);

const reactPath = rtlRequire.resolve('react');
const reactDomPath = rtlRequire.resolve('react-dom');
const reactDomClientPath = rtlRequire.resolve('react-dom/client');
const reactJsxRuntimePath = rtlRequire.resolve('react/jsx-runtime');
const reactJsxDevRuntimePath = rtlRequire.resolve('react/jsx-dev-runtime');

// 在 pnpm workspace 中通过真实包解析 react-router 的 ESM 入口，避免硬编码
// ../node_modules/... 在依赖结构变化后失效。
const reactRouterDomPkg = require.resolve('react-router-dom/package.json');
const reactRouterDomRequire = createRequire(reactRouterDomPkg);
const reactRouterPath = reactRouterDomRequire.resolve('react-router/dist/index.js');
const reactRouterDomPath = reactRouterDomRequire.resolve('react-router-dom/dist/index.js');

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') },
      { find: '@shared', replacement: path.resolve(__dirname, '../shared/types') },
      // 强制所有 React 入口指向同一份真实模块。
      { find: /^react$/, replacement: reactPath },
      { find: /^react-dom$/, replacement: reactDomPath },
      { find: /^react-dom\/client$/, replacement: reactDomClientPath },
      { find: /^react\/jsx-runtime$/, replacement: reactJsxRuntimePath },
      { find: /^react\/jsx-dev-runtime$/, replacement: reactJsxDevRuntimePath },
      // react-router 的 main 字段指向 CJS，CJS 在 dev 环境会回退到 UMD，UMD 会自己再加载一份 React。
      // 强制使用 ESM 版本，确保它与测试代码共享同一份 React dispatcher。
      { find: /^react-router$/, replacement: reactRouterPath },
      { find: /^react-router-dom$/, replacement: reactRouterDomPath },
    ],
  },
  // 禁止 externalize React 生态库，避免被加载成 UMD/CJS 后内部又引入另一份 React。
  ssr: {
    noExternal: ['react', 'react-dom', 'react-router', 'react-router-dom'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // 只内联本地源码，React 等库保持 external，避免被重复转换。
    server: {
      deps: {
        inline: [/frontend\/src/],
      },
    },
    // 覆盖率：仅在使用 --coverage 时生成，避免默认测试变慢。
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      thresholds: {
        global: {
          branches: 60,
          functions: 60,
          lines: 60,
          statements: 60,
        },
      },
    },
  },
});
