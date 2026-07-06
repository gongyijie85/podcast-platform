import '@testing-library/jest-dom';
import { createRequire } from 'node:module';

// 修复 pnpm workspace + Vitest SSR 下出现多份 React 实例的问题。
// CJS 依赖（如 use-sync-external-store）通过 require('react') 加载 React，
// 而测试源码通过 ESM import 加载 React；vite-node 会把它们当成两个模块执行，
// 导致 React dispatcher 为 null。这里把 ESM 导入的 React 注入到 Node require cache，
// 让所有 require('react') / require('react-dom') 都拿到同一份对象。
const requireNode = createRequire(import.meta.url);
const reactPath = requireNode.resolve('react');
const reactDomPath = requireNode.resolve('react-dom');
const reactDomClientPath = requireNode.resolve('react-dom/client');

const reactMod = await import('react');
const reactDomMod = await import('react-dom');
const reactDomClientMod = await import('react-dom/client');

function setCache(path: string, exports: unknown): void {
  const cached = requireNode.cache[path];
  if (cached) {
    cached.exports = exports;
    cached.loaded = true;
  } else {
    requireNode.cache[path] = {
      id: path,
      filename: path,
      loaded: true,
      exports,
      paths: [],
      parent: undefined,
      children: [],
      require: requireNode,
    } as NodeModule;
  }
}

setCache(reactPath, reactMod);
setCache(reactDomPath, reactDomMod);
setCache(reactDomClientPath, reactDomClientMod);

class MemoryStorage implements Storage {
  get length(): number {
    return Object.keys(this).length;
  }

  clear(): void {
    Object.keys(this).forEach((key) => {
      delete (this as unknown as Record<string, string>)[key];
    });
  }

  getItem(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(this, key)
      ? (this as unknown as Record<string, string>)[key]
      : null;
  }

  key(index: number): string | null {
    return Object.keys(this)[index] ?? null;
  }

  removeItem(key: string): void {
    delete (this as unknown as Record<string, string>)[key];
  }

  setItem(key: string, value: string): void {
    (this as unknown as Record<string, string>)[key] = String(value);
  }
}

Object.defineProperty(globalThis, 'Storage', {
  configurable: true,
  writable: true,
  value: MemoryStorage,
});

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: new MemoryStorage(),
});

Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: globalThis.localStorage,
});
