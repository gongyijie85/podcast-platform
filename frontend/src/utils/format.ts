import dayjs from 'dayjs';

export function formatMs(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function formatTime(iso: string | Date): string {
  return dayjs(iso).format('YYYY-MM-DD HH:mm');
}

export function formatPercent(n: number): string {
  return `${Math.max(0, Math.min(100, Math.round(n)))}%`;
}

export function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}
