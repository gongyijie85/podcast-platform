import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export interface AuthUser {
  sub: string;
  email: string;
  nickname: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | null => {
    const req = ctx.switchToHttp().getRequest<Request>();
    return ((req as unknown as { user?: AuthUser }).user) ?? null;
  },
);
