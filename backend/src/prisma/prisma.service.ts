import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * PrismaService wraps `PrismaClient` and is a hard dependency for every
 * controller that touches the database. The previous version of this file
 * eagerly called `this.$connect()` in `onModuleInit`, which meant that if
 * Postgres was down (or `DATABASE_URL` was unset) the entire Nest app
 * crashed at boot with no way to even surface a health-check response.
 *
 * We now make the initial connect *best-effort*: failures are logged at
 * `warn` level and the app still starts. Prisma is itself lazy at the
 * query layer — the first real DB call will re-attempt the connect, so
 * once Postgres comes online the app recovers without a restart.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: process.env.NODE_ENV === 'production' ? ['error'] : ['error', 'warn'],
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
    } catch (err) {
      this.logger.warn(
        `Prisma initial connect failed: ${(err as Error).message}. ` +
          `App will keep running; queries will retry on first use.`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.$disconnect();
    } catch {
      // best-effort; ignore on shutdown
    }
  }
}
