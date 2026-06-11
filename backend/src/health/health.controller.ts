import { Controller, Get } from '@nestjs/common';
import { Public } from '../modules/auth/public.decorator';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check(): { status: string; timestamp: number; uptime: number } {
    return {
      status: 'ok',
      timestamp: Date.now(),
      uptime: process.uptime(),
    };
  }
}
