import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { BgmService } from './bgm.service';
import { Public } from '../auth/public.decorator';
import type { BgmTrackDto, BgmCategory } from '@shared/book';

@Controller('bgm')
export class BgmController {
  constructor(private readonly svc: BgmService) {}

  @Public()
  @Get('tracks')
  list(): Promise<BgmTrackDto[]> {
    return this.svc.listTracks();
  }

  @Public()
  @Get('categories')
  categories(): Promise<BgmCategory[]> {
    return this.svc.listCategories();
  }

  @Public()
  @Get('tracks/:id/audio')
  async audio(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const r = await this.svc.getTrackAudio(id);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(r.filename)}"`);
    res.send(r.buffer);
  }
}
