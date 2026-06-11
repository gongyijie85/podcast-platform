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
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; email: string; nickname: string }>(
        refreshToken,
        { secret: this.config.get<string>('jwt.secret') },
      );
      return this.signTokens(payload.sub, payload.email, payload.nickname);
    } catch {
      throw new UnauthorizedException({
        code: ErrorCode.TOKEN_EXPIRED,
        message: 'Refresh token expired or invalid',
      });
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
    const accessToken = await this.jwt.signAsync(
      { sub: userId, email, nickname, jti: nanoid() },
      {
        secret: this.config.get<string>('jwt.secret'),
        expiresIn: this.config.get<string>('jwt.accessExpires') || '15m',
      },
    );
    const refreshToken = await this.jwt.signAsync(
      { sub: userId, email, nickname, jti: nanoid(), type: 'refresh' },
      {
        secret: this.config.get<string>('jwt.secret'),
        expiresIn: this.config.get<string>('jwt.refreshExpires') || '7d',
      },
    );
    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60,
    };
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
