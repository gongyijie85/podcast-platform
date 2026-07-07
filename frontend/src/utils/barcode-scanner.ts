import { BrowserMultiFormatOneDReader, type IScannerControls } from '@zxing/browser';

const reader = new BrowserMultiFormatOneDReader();

export function normalizeIsbnBarcode(value: string): string | null {
  const normalized = value.replace(/[-\s]/g, '').trim().toUpperCase();
  return /^(978|979)\d{10}$/.test(normalized) || /^\d{9}[\dX]$/.test(normalized)
    ? normalized
    : null;
}

/**
 * 从图片文件中尝试读取 ISBN/EAN-13 条码
 * @param file 图片文件
 * @returns 识别到的 ISBN 字符串，未识别到返回 null
 */
export async function scanIsbnFromImage(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const result = await reader.decodeFromImageUrl(url);
    return normalizeIsbnBarcode(result.getText());
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function startIsbnVideoScan(
  video: HTMLVideoElement,
  onDetected: (isbn: string) => void,
): Promise<IScannerControls> {
  return reader.decodeFromConstraints(
    { audio: false, video: { facingMode: { ideal: 'environment' } } },
    video,
    (result) => {
      const isbn = result ? normalizeIsbnBarcode(result.getText()) : null;
      if (isbn) onDetected(isbn);
    },
  );
}
