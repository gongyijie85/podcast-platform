import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ErrorCode } from '@shared/api';

export const IS_PUBLIC_KEY = 'isPublic';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const req = ctx.switchToHttp().getRequest<Request>();
    const authHeader = (req.headers['authorization'] || req.headers['Authorization']) as
      | string
      | undefined;
    if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
      if (isPublic) return true;
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'Missing bearer token',
      });
    }
    const token = authHeader.slice(7).trim();

    try {
      const payload = await this.jwt.verifyAsync(token, {
        secret: this.config.get<string>('jwt.secret'),
      });
      (req as any).user = payload;
      return true;
    } catch (e: unknown) {
      if (isPublic) return true;
      const msg = e instanceof Error ? e.message : 'Token invalid';
      throw new UnauthorizedException({
        code: ErrorCode.TOKEN_EXPIRED,
        message: msg,
      });
    }
  }
}
