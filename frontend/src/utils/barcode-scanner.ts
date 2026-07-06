import { BrowserCodeReader } from '@zxing/browser';

const reader = new BrowserCodeReader();

/**
 * 从图片文件中尝试读取 ISBN/EAN-13 条码
 * @param file 图片文件
 * @returns 识别到的 ISBN 字符串，未识别到返回 null
 */
export async function scanIsbnFromImage(file: File): Promise<string | null> {
  const url = URL.createObjectURL(file);
  try {
    const result = await reader.decodeFromImageUrl(url);
    const text = result.getText().replace(/[-\s]/g, '').trim();
    // EAN-13 以 978/979 开头，或 ISBN-10 格式
    if (/^(978|979)\d{10}$/.test(text) || /^\d{9}[\dXx]$/.test(text)) {
      return text.toUpperCase();
    }
    return null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
