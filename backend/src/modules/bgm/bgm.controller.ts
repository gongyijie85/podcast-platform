import { Controller, Get } from '@nestjs/common';
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
}
