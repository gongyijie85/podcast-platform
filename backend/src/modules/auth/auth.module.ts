import { Global, Module } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { APP_GUARD, Reflector } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserModule } from '../user/user.module';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

/**
 * AuthModule wires the JWT auth surface and registers `JwtAuthGuard` as the
 * global `APP_GUARD`. Because `JwtAuthGuard` is a class with constructor
 * parameters (JwtService, ConfigService, Reflector), simply providing it via
 * `useClass` causes Nest to try to resolve those dependencies in EVERY
 * module that references the guard (i.e. every `@UseGuards(JwtAuthGuard)`
 * call site). If those modules don't have `JwtService` in their DI subtree,
 * the bootstrap dies with `Nest can't resolve dependencies of the JwtAuthGuard`.
 *
 * We solve this by:
 *   1. Keeping `@Global()` on AuthModule so `JwtService` and `ConfigService`
 *      are visible across the whole app (already the case).
 *   2. Constructing the guard instance ourselves via `useFactory` *inside
 *      AuthModule's provider context*, so the factory receives `JwtService`
 *      from AuthModule's injector. We then hand the resolved instance to
 *      `APP_GUARD`. This guarantees the guard's transitive deps are
 *      resolved in the AuthModule scope, not in every consumer module.
 */
@Global()
@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.secret'),
        signOptions: { expiresIn: config.get<string>('jwt.accessExpires') || '15m' },
      }),
    }),
    UserModule,
  ],
  providers: [
    AuthService,
    // 限流守卫优先于认证守卫执行：先防滥用，再验身份。
    // ThrottlerGuard 为 @Injectable()，构造函数依赖由 Nest 自动解析。
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      inject: [JwtService, ConfigService, Reflector],
      useFactory: (jwt: JwtService, config: ConfigService, reflector: Reflector) =>
        new JwtAuthGuard(jwt, config, reflector),
    },
  ],
  controllers: [AuthController],
  exports: [AuthService, JwtModule, PassportModule],
})
export class AuthModule {}
