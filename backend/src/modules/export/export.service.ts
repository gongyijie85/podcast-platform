import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { SubtitleService } from '../subtitle/subtitle.service';
import { generateScriptPdf } from './pdf.generator';
import { buildZip } from './zip.packager';

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly subs: SubtitleService,
  ) {}

  async exportFile(
    projectId: string,
    format: 'mp3' | 'srt' | 'vtt' | 'txt' | 'pdf' | 'zip',
  ): Promise<{ contentType: string; buffer: Buffer; filename: string }> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { scripts: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!project) throw new NotFoundException({ code: 10004, message: 'Project not found' });

    const script = project.scripts[0];
    const safeName = (project.title || 'podcast').replace(/[^\w\u4e00-\u9fa5-]/g, '_').slice(0, 60);

    if (format === 'mp3') {
      const audio = await this.prisma.audioFile.findFirst({
        where: { projectId, type: 'mix_full' },
        orderBy: { createdAt: 'desc' },
      });
      if (!audio) throw new NotFoundException({ code: 10004, message: 'No mix audio yet' });
      const buf = await this.storage.get(audio.storageKey);
      return { contentType: 'audio/mpeg', buffer: buf, filename: `${safeName}.mp3` };
    }

    if (format === 'srt' || format === 'vtt') {
      const content = await this.subs.getContent(projectId, format);
      return {
        contentType: format === 'srt' ? 'text/plain' : 'text/vtt',
        buffer: Buffer.from(content, 'utf8'),
        filename: `${safeName}.${format}`,
      };
    }

    if (format === 'txt') {
      const content = script?.rawText ?? '';
      return {
        contentType: 'text/plain',
        buffer: Buffer.from(content, 'utf8'),
        filename: `${safeName}.txt`,
      };
    }

    if (format === 'pdf') {
      if (!script) throw new NotFoundException({ code: 10004, message: 'No script' });
      const buf = await generateScriptPdf({
        id: script.id,
        projectId: script.projectId,
        version: script.version,
        content: script.content,
        rawText: script.rawText,
        wordCount: script.wordCount,
        segments: [],
      });
      return { contentType: 'application/pdf', buffer: buf, filename: `${safeName}.pdf` };
    }

    // zip = all of the above
    const entries: { name: string; buffer: Buffer }[] = [];
    const audio = await this.prisma.audioFile.findFirst({ where: { projectId, type: 'mix_full' } });
    if (audio) entries.push({ name: `${safeName}.mp3`, buffer: await this.storage.get(audio.storageKey) });
    if (script) {
      const srt = await this.subs.getContent(projectId, 'srt').catch(() => '');
      if (srt) entries.push({ name: `${safeName}.srt`, buffer: Buffer.from(srt, 'utf8') });
      const vtt = await this.subs.getContent(projectId, 'vtt').catch(() => '');
      if (vtt) entries.push({ name: `${safeName}.vtt`, buffer: Buffer.from(vtt, 'utf8') });
      entries.push({ name: `${safeName}.txt`, buffer: Buffer.from(script.rawText, 'utf8') });
      const pdf = await generateScriptPdf({
        id: script.id,
        projectId: script.projectId,
        version: script.version,
        content: script.content,
        rawText: script.rawText,
        wordCount: script.wordCount,
        segments: [],
      });
      entries.push({ name: `${safeName}.pdf`, buffer: pdf });
    }
    const zipBuf = await buildZip(entries);
    return { contentType: 'application/zip', buffer: zipBuf, filename: `${safeName}.zip` };
  }
}
