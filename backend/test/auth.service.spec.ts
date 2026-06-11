import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../src/modules/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { ErrorCode } from '@shared/api';

/**
 * Unit tests for `AuthService` — exercise the three core methods (`register`,
 * `login`, `refresh`) plus the `me` lookup, with a fully-mocked Prisma +
 * JwtService + ConfigService. These run without Postgres.
 */

type MockPrisma = {
  user: {
    findUnique: jest.Mock;
    create: jest.Mock;
  };
};

type MockJwt = {
  signAsync: jest.Mock;
  verifyAsync: jest.Mock;
};

function makePrisma(): MockPrisma {
  return {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };
}

function makeJwt(): MockJwt {
  return {
    signAsync: jest.fn(),
    verifyAsync: jest.fn(),
  };
}

function makeConfig(): { get: jest.Mock } {
  return {
    get: jest.fn((key: string) => {
      const map: Record<string, string> = {
        'jwt.secret': 'test-secret',
        'jwt.accessExpires': '15m',
        'jwt.refreshExpires': '7d',
      };
      return map[key];
    }),
  };
}

function makeService() {
  const prisma = makePrisma();
  const jwt = makeJwt();
  const config = makeConfig();
  const svc = new AuthService(
    prisma as unknown as PrismaService,
    jwt as unknown as JwtService,
    config as unknown as ConfigService,
  );
  return { svc, prisma, jwt, config };
}

const fixedUser = {
  id: 'user-1',
  email: 'a@b.com',
  phone: null,
  nickname: 'Tester',
  avatarUrl: 'https://example.com/a.png',
  passwordHash: '$2a$10$abcdefghijklmnopqrstuv',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('AuthService', () => {
  describe('register()', () => {
    it('creates a new user and returns tokens + user dto', async () => {
      const { svc, prisma, jwt } = makeService();
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(fixedUser);
      jwt.signAsync
        .mockResolvedValueOnce('access-abc')
        .mockResolvedValueOnce('refresh-xyz');

      const out = await svc.register('a@b.com', 'passw0rd!', 'Tester', '13800000000');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'a@b.com' } });
      expect(prisma.user.create).toHaveBeenCalledTimes(1);
      const createArg = prisma.user.create.mock.calls[0][0];
      expect(createArg.data.email).toBe('a@b.com');
      expect(createArg.data.nickname).toBe('Tester');
      expect(createArg.data.phone).toBe('13800000000');
      // passwordHash should be a bcrypt hash, not the raw password
      expect(createArg.data.passwordHash).not.toBe('passw0rd!');
      expect(createArg.data.passwordHash).toMatch(/^\$2[aby]\$/);

      expect(jwt.signAsync).toHaveBeenCalledTimes(2);
      expect(out.tokens.accessToken).toBe('access-abc');
      expect(out.tokens.refreshToken).toBe('refresh-xyz');
      expect(out.email).toBe('a@b.com');
      expect(out.nickname).toBe('Tester');
      expect(out.id).toBe('user-1');
    });

    it('omits phone when not provided (phone = null in db payload)', async () => {
      const { svc, prisma, jwt } = makeService();
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue(fixedUser);
      jwt.signAsync.mockResolvedValueOnce('a').mockResolvedValueOnce('r');

      await svc.register('a@b.com', 'pw', 'Nick');
      const createArg = prisma.user.create.mock.calls[0][0];
      expect(createArg.data.phone).toBeNull();
    });

    it('throws ConflictException(EMAIL_REGISTERED) when email already exists', async () => {
      const { svc, prisma, jwt } = makeService();
      prisma.user.findUnique.mockResolvedValue(fixedUser);

      await expect(svc.register('a@b.com', 'pw', 'Nick')).rejects.toBeInstanceOf(ConflictException);
      await expect(svc.register('a@b.com', 'pw', 'Nick')).rejects.toMatchObject({
        response: { code: ErrorCode.EMAIL_REGISTERED },
      });
      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(jwt.signAsync).not.toHaveBeenCalled();
    });
  });

  describe('login()', () => {
    it('returns tokens + dto for valid credentials', async () => {
      const { svc, prisma, jwt } = makeService();
      // Use a real bcrypt hash so bcryptjs.compare can verify deterministically.
      const bcrypt = await import('bcryptjs');
      const realHash = await bcrypt.hash('passw0rd!', 4);
      prisma.user.findUnique.mockResolvedValue({ ...fixedUser, passwordHash: realHash });
      jwt.signAsync.mockResolvedValueOnce('access').mockResolvedValueOnce('refresh');

      const out = await svc.login('a@b.com', 'passw0rd!');
      expect(out.tokens.accessToken).toBe('access');
      expect(out.tokens.refreshToken).toBe('refresh');
      expect(out.email).toBe('a@b.com');
    });

    it('throws UnauthorizedException(BAD_CREDENTIALS) when user not found', async () => {
      const { svc, prisma } = makeService();
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(svc.login('a@b.com', 'pw')).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(svc.login('a@b.com', 'pw')).rejects.toMatchObject({
        response: { code: ErrorCode.BAD_CREDENTIALS },
      });
    });

    it('throws UnauthorizedException(BAD_CREDENTIALS) on bad password', async () => {
      const { svc, prisma } = makeService();
      const bcrypt = await import('bcryptjs');
      const realHash = await bcrypt.hash('correct-pw', 4);
      prisma.user.findUnique.mockResolvedValue({ ...fixedUser, passwordHash: realHash });

      await expect(svc.login('a@b.com', 'wrong-pw')).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(svc.login('a@b.com', 'wrong-pw')).rejects.toMatchObject({
        response: { code: ErrorCode.BAD_CREDENTIALS },
      });
    });
  });

  describe('refresh()', () => {
    it('returns a fresh token pair when the refresh token is valid', async () => {
      const { svc, jwt, config } = makeService();
      jwt.verifyAsync.mockResolvedValue({
        sub: 'user-1',
        email: 'a@b.com',
        nickname: 'Tester',
        type: 'refresh',
      });
      jwt.signAsync.mockResolvedValueOnce('new-access').mockResolvedValueOnce('new-refresh');

      const out = await svc.refresh('a-valid-refresh-token');
      expect(jwt.verifyAsync).toHaveBeenCalledWith(
        'a-valid-refresh-token',
        expect.objectContaining({ secret: 'test-secret' }),
      );
      expect(jwt.signAsync).toHaveBeenCalledTimes(2);
      expect(out.accessToken).toBe('new-access');
      expect(out.refreshToken).toBe('new-refresh');
    });

    it('throws UnauthorizedException(TOKEN_EXPIRED) when verification fails', async () => {
      const { svc, jwt } = makeService();
      jwt.verifyAsync.mockRejectedValue(new Error('jwt expired'));

      await expect(svc.refresh('garbage')).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(svc.refresh('garbage')).rejects.toMatchObject({
        response: { code: ErrorCode.TOKEN_EXPIRED },
      });
    });
  });

  describe('me()', () => {
    it('returns the UserDto for a known user id', async () => {
      const { svc, prisma } = makeService();
      prisma.user.findUnique.mockResolvedValue(fixedUser);

      const out = await svc.me('user-1');
      expect(out).toMatchObject({
        id: 'user-1',
        email: 'a@b.com',
        nickname: 'Tester',
      });
      expect(typeof out.createdAt).toBe('string');
    });

    it('throws UnauthorizedException(UNAUTHORIZED) when user no longer exists', async () => {
      const { svc, prisma } = makeService();
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(svc.me('ghost')).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(svc.me('ghost')).rejects.toMatchObject({
        response: { code: ErrorCode.UNAUTHORIZED },
      });
    });
  });
});
