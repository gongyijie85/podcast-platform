import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';
import type { ScriptDto, ScriptSegmentDto } from '@shared/script';

const CJK_FONT_NAME = 'NotoSansCJK';

const CJK_FONT_CANDIDATES = [
  process.env.PDF_FONT_PATH,
  'C:\\Windows\\Fonts\\Noto Sans SC (TrueType).otf',
  'C:\\Windows\\Fonts\\NotoSansSC-VF.ttf',
  'C:\\Windows\\Fonts\\msyh.ttc',
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc',
  '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
  '/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc',
].filter(Boolean) as string[];

function resolveCjkFont(): string | null {
  for (const candidate of CJK_FONT_CANDIDATES) {
    const fontPath = path.resolve(candidate);
    if (fs.existsSync(fontPath)) return fontPath;
  }
  return null;
}

function useReadableFont(doc: PDFKit.PDFDocument): void {
  const fontPath = resolveCjkFont();
  if (!fontPath) return;
  doc.registerFont(CJK_FONT_NAME, fontPath);
  doc.font(CJK_FONT_NAME);
}

export async function generateScriptPdf(script: ScriptDto): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: script.id } });
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (e: Error) => reject(e));

    useReadableFont(doc);
    doc.fontSize(20).text('Podcast Script', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#666').text(`Version ${script.version} · ${script.wordCount} 字`);
    doc.moveDown(1);

    const segments: ScriptSegmentDto[] = (script.segments ?? []) as ScriptSegmentDto[];
    if (segments.length === 0) {
      doc.fillColor('#000').fontSize(12).text(script.rawText || '(空)');
    } else {
      for (const seg of segments) {
        const speaker = seg.speaker === 'host' ? '主持人' : '嘉宾';
        // Three-column layout: speaker | text | emotion
        const startY = doc.y;
        const col1X = 40;
        const col1W = 80;
        const col2X = 130;
        const col2W = 340;
        const col3X = 480;
        const col3W = 80;

        doc.fontSize(10).fillColor('#6366f1').text(speaker, col1X, startY, { width: col1W });
        doc.fontSize(11).fillColor('#000').text(seg.text, col2X, startY, { width: col2W });
        doc.fontSize(9).fillColor('#ec4899').text(`[${seg.emotion}]`, col3X, startY, { width: col3W });
        doc.moveDown(1);
      }
    }

    doc.end();
  });
}
