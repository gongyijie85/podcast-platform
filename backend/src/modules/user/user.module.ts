import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserPreferenceController } from './user.controller';

@Module({
  controllers: [UserPreferenceController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
