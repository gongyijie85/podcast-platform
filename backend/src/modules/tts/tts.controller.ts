import { Body, Controller, Get, Post } from '@nestjs/common';
import { TtsService } from './tts.service';
import { TtsPreviewDto } from './dto/tts-voice.dto';
import { Public } from '../auth/public.decorator';
import type { TtsVoice, TtsPreviewResult } from '@shared/book';

@Controller('tts')
export class TtsController {
  constructor(private readonly svc: TtsService) {}

  @Public()
  @Get('voices')
  listVoices(): Promise<TtsVoice[]> {
    return this.svc.listVoices();
  }

  @Public()
  @Post('preview')
  preview(@Body() dto: TtsPreviewDto): Promise<TtsPreviewResult> {
    return this.svc.preview(dto.voiceId, dto.text, dto.emotion);
  }
}
