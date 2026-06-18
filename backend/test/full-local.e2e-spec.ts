import { Test, type TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const IS_E2E_RUN = process.env.JEST_E2E === '1';
const LOCAL_FULL_E2E = process.env.LOCAL_FULL_E2E === '1';
const DATABASE_URL = process.env.DATABASE_URL ?? '';
const IS_LOCAL_DB = /^postgresql:\/\/postgres:postgres@(localhost|127\.0\.0\.1):5432\/podcast(?:\?|$)/.test(
  DATABASE_URL,
);
const SHOULD_SKIP = !IS_E2E_RUN || !LOCAL_FULL_E2E || !IS_LOCAL_DB;

(SHOULD_SKIP ? describe.skip : describe)('Full local e2e (auth → project → preferences → share)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let userEmail: string;
  let userId: string;
  let guestProjectId: string;
  let ownedProjectId: string;

  const password = 'passw0rd!';
  const projectPayload = {
    title: 'Local E2E Podcast',
    mode: 'independent',
    isbns: ['9787121362200'],
    voices: [
      { role: 'host', voiceId: 'BV001_streaming', provider: 'mock' },
      { role: 'guest', voiceId: 'BV007_streaming', provider: 'mock' },
    ],
    bgmConfigs: [
      { segment: 'intro', bgmTrackId: 'bgm-relax-1', volume: 45, fadeInMs: 800, fadeOutMs: 800 },
      { segment: 'body', bgmTrackId: 'bgm-tech-1', volume: 30, fadeInMs: 1000, fadeOutMs: 1000 },
      { segment: 'outro', bgmTrackId: 'bgm-relax-1', volume: 35, fadeInMs: 600, fadeOutMs: 1200 },
    ],
    voiceVolume: 80,
    subtitleEnabled: true,
  } as const;

  beforeAll(async () => {
    process.env.LLM_API_KEY = '';
    process.env.DOUBAO_API_KEY = '';
    process.env.STORAGE_DRIVER = 'minio';
    process.env.MINIO_ENDPOINT = 'localhost';
    process.env.MINIO_PORT = '9000';
    process.env.MINIO_ACCESS_KEY = 'minioadmin';
    process.env.MINIO_SECRET_KEY = 'minioadmin';
    process.env.MINIO_BUCKET = 'podcast';
    process.env.MINIO_USE_SSL = 'false';

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: false,
      }),
    );
    const { ResponseInterceptor } = await import('../src/common/interceptors/response.interceptor');
    const { HttpExceptionFilter } = await import('../src/common/filters/http-exception.filter');
    app.useGlobalInterceptors(new ResponseInterceptor());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { title: { startsWith: 'Local E2E' } } });
    if (userEmail) {
      await prisma.user.deleteMany({ where: { email: userEmail } });
    }
    await app.close();
  });

  it('registers, logs in, and reads current user', async () => {
    userEmail = `local-e2e-${Date.now()}@local-e2e.test`;

    const registered = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: userEmail, password, nickname: 'Local E2E' })
      .expect(201);
    expect(registered.body.code).toBe(0);
    expect(registered.body.data.tokens.accessToken).toBeDefined();
    userId = registered.body.data.id;

    const loggedIn = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email: userEmail, password })
      .expect(200);
    expect(loggedIn.body.code).toBe(0);
    accessToken = loggedIn.body.data.tokens.accessToken;

    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(me.body.data.email).toBe(userEmail);
  });

  it('creates a guest draft and syncs it into the logged-in account', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/projects')
      .send({ ...projectPayload, title: 'Local E2E Guest Draft' })
      .expect(201);
    guestProjectId = created.body.data.id;
    expect(created.body.data.userId).toBeNull();
    expect(created.body.data.coverUrl).toContain('data:image/svg+xml');

    const synced = await request(app.getHttpServer())
      .post('/api/projects/sync')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ projectIds: [guestProjectId] })
      .expect(201);
    expect(synced.body.data.synced).toBe(1);

    const project = await request(app.getHttpServer())
      .get(`/api/projects/${guestProjectId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(project.body.data.userId).toBe(userId);
  });

  it('saves and reloads user preferences', async () => {
    const payload = {
      recentVoiceIds: ['BV001_streaming', 'BV007_streaming'],
      recentBgmTrackIds: ['bgm-tech-1', 'bgm-relax-1'],
      subtitleStyle: { fontSize: 26, lineHeight: 1.6 },
      language: 'zh-CN',
    };

    const patched = await request(app.getHttpServer())
      .patch('/api/users/me/preferences')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(payload)
      .expect(200);
    expect(patched.body.data).toMatchObject(payload);

    const loaded = await request(app.getHttpServer())
      .get('/api/users/me/preferences')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(loaded.body.data).toMatchObject(payload);
  });

  it('creates an owned project and exercises generate, cancel, regenerate, share, list, and delete', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ...projectPayload, title: 'Local E2E Owned Project' })
      .expect(201);
    ownedProjectId = created.body.data.id;
    expect(created.body.data.userId).toBe(userId);

    const generated = await request(app.getHttpServer())
      .post(`/api/projects/${ownedProjectId}/generate`)
      .expect(201);
    expect(generated.body.data.accepted).toBe(true);
    expect(generated.body.data.jobIds.script).toContain(ownedProjectId);

    const cancelled = await request(app.getHttpServer())
      .post(`/api/projects/${ownedProjectId}/cancel`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    expect(cancelled.body.data.project.status).toBe('cancelled');

    const regenerated = await request(app.getHttpServer())
      .post(`/api/projects/${ownedProjectId}/regenerate`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);
    expect(regenerated.body.data.accepted).toBe(true);
    expect(regenerated.body.data.project.status).toBe('generating');

    const share = await request(app.getHttpServer())
      .post(`/api/projects/${ownedProjectId}/share`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Origin', 'http://localhost:5173')
      .expect(201);
    expect(share.body.data.url).toContain('/share/');

    const shared = await request(app.getHttpServer())
      .get(`/api/share/${share.body.data.token}`)
      .expect(200);
    expect(shared.body.data.project.id).toBe(ownedProjectId);

    const list = await request(app.getHttpServer())
      .get('/api/projects?page=1&pageSize=10')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(list.body.data.items.some((project: { id: string }) => project.id === ownedProjectId)).toBe(true);

    await request(app.getHttpServer())
      .delete(`/api/projects/${ownedProjectId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    ownedProjectId = '';
  });
});
