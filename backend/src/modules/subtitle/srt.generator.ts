import type { ScriptSegmentDto } from '@shared/script';

const pad = (n: number, w = 2) => String(Math.max(0, Math.floor(n))).padStart(w, '0');
const formatSrtTime = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms));
  const h = Math.floor(total / 3_600_000);
  const m = Math.floor((total % 3_600_000) / 60_000);
  const s = Math.floor((total % 60_000) / 1_000);
  const milli = total % 1_000;
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(milli, 3)}`;
};

export function generateSrt(segments: ScriptSegmentDto[]): string {
  const lines: string[] = [];
  const sorted = [...segments].sort((a, b) => a.orderIndex - b.orderIndex);
  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    const start = s.startTime ?? i * 3000;
    const end = s.endTime ?? (i + 1) * 3000;
    const label = s.speaker === 'host' ? '主持人' : '嘉宾';
    lines.push(String(i + 1));
    lines.push(`${formatSrtTime(start)} --> ${formatSrtTime(end)}`);
    lines.push(`${label}（${s.emotion}）：${s.text}`);
    lines.push('');
  }
  return lines.join('\n');
}
