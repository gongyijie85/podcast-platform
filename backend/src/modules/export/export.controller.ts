import { Controller, Get, Param, Query, Res, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { ExportService } from './export.service';
import { Public } from '../auth/public.decorator';

@Controller('projects/:id')
export class ExportController {
  constructor(private readonly svc: ExportService) {}

  @Public()
  @Get('audio')
  async audio(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const r = await this.svc.exportFile(id, 'mp3');
    res.setHeader('Content-Type', r.contentType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(r.filename)}"`);
    res.send(r.buffer);
  }

  @Public()
  @Get('subtitle')
  async subtitle(
    @Param('id') id: string,
    @Query('format') format: 'srt' | 'vtt' = 'srt',
    @Res() res: Response,
  ): Promise<void> {
    if (format !== 'srt' && format !== 'vtt') {
      throw new NotFoundException({ code: 10004, message: 'Unsupported subtitle format' });
    }
    const r = await this.svc.exportFile(id, format);
    res.setHeader('Content-Type', r.contentType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(r.filename)}"`);
    res.send(r.buffer);
  }

  @Public()
  @Get('export')
  async exportFile(
    @Param('id') id: string,
    @Query('format') format: 'mp3' | 'srt' | 'vtt' | 'txt' | 'pdf' | 'zip' = 'zip',
    @Res() res: Response,
  ): Promise<void> {
    const r = await this.svc.exportFile(id, format);
    res.setHeader('Content-Type', r.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(r.filename)}"`);
    res.send(r.buffer);
  }
}
