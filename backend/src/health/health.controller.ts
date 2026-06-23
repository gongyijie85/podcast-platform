import { Controller, Get } from '@nestjs/common';
import { Public } from '../modules/auth/public.decorator';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check(): { status: string; timestamp: number; uptime: number; commit: string; buildTime: string | null } {
    return {
      status: 'ok',
      timestamp: Date.now(),
      uptime: process.uptime(),
      commit: this.commitSha(),
      buildTime: process.env.BUILD_TIME ?? null,
    };
  }

  private commitSha(): string {
    return (
      process.env.RENDER_GIT_COMMIT ??
      process.env.GIT_COMMIT ??
      process.env.VERCEL_GIT_COMMIT_SHA ??
      'unknown'
    );
  }
}
