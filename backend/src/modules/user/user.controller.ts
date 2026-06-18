import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UserService } from './user.service';
import type { UserPreferencesDto } from '@shared/user';

@Controller('users/me/preferences')
@UseGuards(JwtAuthGuard)
export class UserPreferenceController {
  constructor(private readonly users: UserService) {}

  @Get()
  get(@CurrentUser() user: AuthUser): Promise<UserPreferencesDto> {
    return this.users.getPreferences(user.sub);
  }

  @Patch()
  patch(
    @CurrentUser() user: AuthUser,
    @Body() body: UserPreferencesDto,
  ): Promise<UserPreferencesDto> {
    return this.users.patchPreferences(user.sub, body);
  }
}
