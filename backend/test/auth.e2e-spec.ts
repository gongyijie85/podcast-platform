import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request = require('supertest');
import { AppModule } from '../src/app.module';

/**
 * This suite exercises the full HTTP path (register → login → me → project CRUD)
 * against a real Postgres + Prisma instance. Without that infra it cannot run.
 *
 * Skipping conditions (any of these → entire suite is skipped, NOT failed):
 *  1. `process.env.SKIP_E2E === '1'` — the explicit opt-out (CI default).
 *  2. No `DATABASE_URL` set (or set to the local placeholder).
 *  3. The Prisma client fails to construct (a cheap connectivity probe we run
 *     in `beforeAll` so we don't even try to compile AppModule).
 *
 * Companion unit tests for `AuthService` (register / login / refresh) live in
 * `auth.service.spec.ts` and run without Postgres.
 */
const SKIP_E2E = process.env.SKIP_E2E === '1';
const DATABASE_URL = process.env.DATABASE_URL ?? '';
const NO_DB = !DATABASE_URL || /localhost:5432|podcast@/.test(DATABASE_URL);

(SKIP_E2E || NO_DB ? describe.skip : describe)('Auth + Project e2e (happy path)', () => {
  let app: INestApplication;
  let accessToken: string;
  let projectId: string;
  const email = `test-${Date.now()}@example.com`;
  const password = 'passw0rd!';

  beforeAll(async () => {
    const mod: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = mod.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /api/auth/register', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password, nickname: 'Tester' })
      .expect(201);
    expect(res.body.code).toBe(0);
    expect(res.body.data.accessToken).toBeDefined();
    accessToken = res.body.data.accessToken;
  });

  it('POST /api/auth/login', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    expect(res.body.code).toBe(0);
    expect(res.body.data.tokens.accessToken).toBeDefined();
    accessToken = res.body.data.tokens.accessToken;
  });

  it('GET /api/auth/me', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.data.email).toBe(email);
  });

  it('POST /api/projects (guest mode)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/projects')
      .send({
        title: 'Test Project',
        mode: 'independent',
        isbns: ['9787121362200'],
        voices: [{ role: 'host', voiceId: 'BV001_streaming', provider: 'volcengine' }],
        bgmConfigs: [
          { segment: 'intro', bgmTrackId: 'bgm-relax-1', volume: 50, fadeInMs: 1000, fadeOutMs: 1000 },
          { segment: 'body', bgmTrackId: 'bgm-tech-1', volume: 30, fadeInMs: 1000, fadeOutMs: 1000 },
          { segment: 'outro', bgmTrackId: 'bgm-relax-1', volume: 50, fadeInMs: 1000, fadeOutMs: 1000 },
        ],
      })
      .expect(201);
    expect(res.body.data.id).toBeDefined();
    projectId = res.body.data.id;
  });

  it('GET /api/projects/:id', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/projects/${projectId}`)
      .expect(200);
    expect(res.body.data.title).toBe('Test Project');
  });
});
