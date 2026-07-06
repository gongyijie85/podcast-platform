import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { PrismaService } from '../../prisma/prisma.service';
import { ErrorCode } from '@shared/api';
import type { AuthResponse, AuthTokens, UserDto } from '@shared/user';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(email: string, password: string, nickname: string, phone?: string): Promise<AuthResponse> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException({
        code: ErrorCode.EMAIL_REGISTERED,
        message: 'Email already registered',
      });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.prisma.user.create({
      data: {
        email,
        nickname,
        phone: phone ?? null,
        passwordHash,
        avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(nickname)}`,
      },
    });
    const tokens = await this.signTokens(user.id, user.email, user.nickname);
    return { ...this.toUserDto(user), tokens };
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCode.BAD_CREDENTIALS,
        message: 'Invalid email or password',
      });
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException({
        code: ErrorCode.BAD_CREDENTIALS,
        message: 'Invalid email or password',
      });
    }
    const tokens = await this.signTokens(user.id, user.email, user.nickname);
    return { ...this.toUserDto(user), tokens };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    let payload: { sub: string; email: string; nickname: string; jti: string; type: string };
    try {
      payload = await this.jwt.verifyAsync<{
        sub: string;
        email: string;
        nickname: string;
        jti: string;
        type: string;
      }>(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException({
        code: ErrorCode.TOKEN_EXPIRED,
        message: 'Refresh token expired or invalid',
      });
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException({
        code: ErrorCode.TOKEN_EXPIRED,
        message: 'Refresh token expired or invalid',
      });
    }

    const stored = await this.prisma.refreshToken.findUnique({ where: { jti: payload.jti } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException({
        code: ErrorCode.TOKEN_EXPIRED,
        message: 'Refresh token expired or invalid',
      });
    }

    // 每次刷新后吊销旧的 refresh token，实现 token rotation
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.signTokens(payload.sub, payload.email, payload.nickname);
  }

  async logout(refreshToken: string): Promise<void> {
    try {
      const payload = await this.jwt.verifyAsync<{ jti: string; type: string }>(refreshToken, {
        secret: this.config.get<string>('jwt.refreshSecret'),
      });
      if (payload.type !== 'refresh') {
        return;
      }
      await this.prisma.refreshToken.updateMany({
        where: { jti: payload.jti, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } catch {
      // 退出时对无效令牌保持静默，避免泄露令牌状态
    }
  }

  async me(userId: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCode.UNAUTHORIZED,
        message: 'User not found',
      });
    }
    return this.toUserDto(user);
  }

  private async signTokens(userId: string, email: string, nickname: string): Promise<AuthTokens> {
    const accessJti = nanoid();
    const refreshJti = nanoid();
    const accessExpires = this.config.get<string>('jwt.accessExpires') || '15m';
    const refreshExpires = this.config.get<string>('jwt.refreshExpires') || '7d';

    // access token 与 refresh token 使用不同 secret
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email, nickname, jti: accessJti },
      {
        secret: this.config.get<string>('jwt.secret'),
        expiresIn: accessExpires,
      },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, email, nickname, jti: refreshJti, type: 'refresh' },
      {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: refreshExpires,
      },
    );

    // 把 refresh token 的 jti 持久化，用于吊销与轮换
    await this.prisma.refreshToken.create({
      data: {
        userId,
        jti: refreshJti,
        expiresAt: new Date(Date.now() + this.parseDurationMs(refreshExpires)),
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.parseDurationMs(accessExpires) / 1000,
    };
  }

  private parseDurationMs(value: string): number {
    const match = value.trim().match(/^(\d+)\s*([smhd])$/i);
    if (!match) {
      return 15 * 60 * 1000; // 默认 15 分钟
    }
    const amount = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    const msPerUnit: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    return amount * (msPerUnit[unit] ?? 60 * 1000);
  }

  private toUserDto(user: {
    id: string;
    email: string;
    phone: string | null;
    nickname: string;
    avatarUrl: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): UserDto {
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }
}
