import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { FfmpegUtil } from './ffmpeg.util';
import { ProgressGateway } from '../ws/progress.gateway';
import { randomUUID } from 'node:crypto';
import type { ProgressEvent } from '@shared/job';
import { STAGE_WEIGHTS } from '../queue/constants';

@Injectable()
export class MixService {
  private readonly logger = new Logger(MixService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly progress: ProgressGateway,
  ) {}

  async mixProject(projectId: string): Promise<{ key: string; durationMs: number; sizeBytes: number }> {
    const traceId = randomUUID();
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        bgmConfigs: { include: { bgmTrack: true } },
        audioFiles: true,
        scripts: { orderBy: { createdAt: 'desc' }, take: 1, include: { segments: { orderBy: { orderIndex: 'asc' } } } },
      },
    });
    if (!project) throw new Error('Project not found');

    // 1. Concatenate all TTS segment buffers
    const segBuffers: Buffer[] = [];
    const segments = project.scripts[0]?.segments ?? [];
    for (const seg of segments) {
      const audio = project.audioFiles.find((a) => a.storageKey === `tts/${projectId}/${seg.id}.mp3`);
      if (!audio) continue;
      const buf = await this.storage.get(audio.storageKey);
      segBuffers.push(buf);
    }
    if (segBuffers.length === 0) {
      throw new Error('No TTS segments to mix');
    }
    const voiceBuffer = await FfmpegUtil.concatenateBuffers(segBuffers);

    // 2. Use the 'body' BGM (or first) for backdrop
    const bodyBgm = project.bgmConfigs.find((b) => b.segment === 'body') ?? project.bgmConfigs[0];
    let bgmBuffer: Buffer | null = null;
    if (bodyBgm) {
      try {
        bgmBuffer = await this.storage.get(bodyBgm.bgmTrack.storageKey);
      } catch {
        // BGM file not in storage - skip silently
        bgmBuffer = null;
      }
    }

    // 3. Mix with peak limiter
    const result = await FfmpegUtil.mixWithBgm({
      voice: voiceBuffer,
      bgm: bgmBuffer,
      voiceVolume: project.voiceVolume,
      bgmVolume: bodyBgm?.volume ?? 0,
      fadeInMs: bodyBgm?.fadeInMs ?? 1000,
      fadeOutMs: bodyBgm?.fadeOutMs ?? 1000,
    });

    const key = `mix/${projectId}/full.mp3`;
    await this.storage.put(key, result.buffer, 'audio/mpeg');

    // 4. Approximate duration: max of TTS total
    const totalMs = segments.reduce((acc, s) => acc + ((s.endTime ?? 0) - (s.startTime ?? 0)), 0) || 60_000;

    await this.prisma.audioFile.upsert({
      where: { id: `${projectId}-mix-full` },
      create: {
        id: `${projectId}-mix-full`,
        projectId,
        type: 'mix_full',
        storageKey: key,
        format: 'mp3',
        durationMs: totalMs,
        sizeBytes: BigInt(result.buffer.length),
      },
      update: { storageKey: key, durationMs: totalMs, sizeBytes: BigInt(result.buffer.length) },
    });

    await this.prisma.project.update({
      where: { id: projectId },
      data: { status: 'done', progress: 100, currentStage: 'mix' },
    });

    const event: ProgressEvent = {
      type: 'project.progress',
      projectId,
      stage: 'mix',
      progress: 100,
      message: '播客合成完成',
      timestamp: Date.now(),
      traceId,
    };
    await this.progress.emit(event);

    void STAGE_WEIGHTS;
    return { key, durationMs: totalMs, sizeBytes: result.buffer.length };
  }
}
