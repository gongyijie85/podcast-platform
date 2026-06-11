/* eslint-disable no-console */
type Level = 'debug' | 'info' | 'warn' | 'error';

const levelOrder: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel: Level = ((import.meta.env.MODE === 'production' ? 'warn' : 'debug') as Level);

function log(level: Level, ...args: unknown[]): void {
  if (levelOrder[level] < levelOrder[minLevel]) return;
  const ts = new Date().toISOString();
  const fn = console[level === 'debug' ? 'log' : level] || console.log;
  fn(`[${ts}] [${level}]`, ...args);
}

export const logger = {
  debug: (...a: unknown[]) => log('debug', ...a),
  info: (...a: unknown[]) => log('info', ...a),
  warn: (...a: unknown[]) => log('warn', ...a),
  error: (...a: unknown[]) => log('error', ...a),
};
