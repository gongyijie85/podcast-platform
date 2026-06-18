import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ErrorCode } from '@shared/api';
import type { UserDto, UserPreferencesDto } from '@shared/user';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException({ code: ErrorCode.NOT_FOUND, message: 'User not found' });
    }
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

  async setPreference(userId: string, key: string, value: unknown): Promise<void> {
    await this.prisma.userPreference.upsert({
      where: { userId_key: { userId, key } },
      create: { userId, key, value: value as object },
      update: { value: value as object },
    });
  }

  async getPreference<T>(userId: string, key: string): Promise<T | null> {
    const pref = await this.prisma.userPreference.findUnique({
      where: { userId_key: { userId, key } },
    });
    return (pref?.value as T) ?? null;
  }

  async getPreferences(userId: string): Promise<UserPreferencesDto> {
    return (await this.getPreference<UserPreferencesDto>(userId, 'preferences')) ?? {};
  }

  async patchPreferences(userId: string, patch: UserPreferencesDto): Promise<UserPreferencesDto> {
    const current = await this.getPreferences(userId);
    const next: UserPreferencesDto = {
      ...current,
      ...patch,
      subtitleStyle: {
        ...(current.subtitleStyle ?? { fontSize: 16, lineHeight: 1.6 }),
        ...(patch.subtitleStyle ?? {}),
      },
      recentVoiceIds: patch.recentVoiceIds ?? current.recentVoiceIds,
      recentBgmTrackIds: patch.recentBgmTrackIds ?? current.recentBgmTrackIds,
    };
    await this.setPreference(userId, 'preferences', next);
    return next;
  }
}
