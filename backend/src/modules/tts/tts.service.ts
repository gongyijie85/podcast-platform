import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { VolcengineAdapter } from './adapters/volcengine.adapter';
import { AzureAdapter } from './adapters/azure.adapter';
import { XiaomiMimoAdapter } from './adapters/xiaomi-mimo.adapter';
import { StorageService } from '../storage/storage.service';
import { QueueService } from '../queue/queue.service';
import { ProgressGateway } from '../ws/progress.gateway';
import { randomUUID } from 'node:crypto';
import { normalizeIsbn } from '../../common/utils/isbn';
import type { TtsVoice, TtsPreviewResult } from '@shared/book';
import type { ProgressEvent } from '@shared/job';
import { STAGE_WEIGHTS } from '../queue/constants';

@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly volc: VolcengineAdapter,
    private readonly azure: AzureAdapter,
    private readonly xiaomi: XiaomiMimoAdapter,
    private readonly storage: StorageService,
    @Inject(forwardRef(() => QueueService))
    private readonly queues: QueueService,
    private readonly progress: ProgressGateway,
  ) {}

  async listVoices(): Promise<TtsVoice[]> {
    const [x, v, a] = await Promise.all([this.xiaomi.listVoices(), this.volc.listVoices(), this.azure.listVoices()]);
    return [...x, ...v, ...a];
  }

  async preview(voiceId: string, text: string, _emotion?: string): Promise<TtsPreviewResult> {
    const adapter = this.pickAdapter(voiceId);
    return adapter.preview(text, voiceId);
  }

  /**
   * Run TTS for every segment of the project's latest script, upload to storage,
   * write AudioFile rows, then trigger subtitle stage.
   */
  async synthesizeAllForProject(projectId: string): Promise<{ count: number; totalMs: number }> {
    const traceId = randomUUID();
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { voices: true, scripts: { orderBy: { createdAt: 'desc' }, take: 1, include: { segments: { orderBy: { orderIndex: 'asc' } } } } },
    });
    if (!project) throw new Error('Project not found');
    const script = project.scripts[0];
    if (!script) throw new Error('No script to synthesize');

    const voiceByRole = new Map(project.voices.map((v) => [v.role, v]));
    const total = script.segments.length;
    let cursorMs = 0;
    let synthesized = 0;

    for (let i = 0; i < total; i++) {
      const seg = script.segments[i];
      const voice = voiceByRole.get(seg.speaker);
      const voiceId = voice?.voiceId ?? 'BV001_streaming';
      const adapter = this.pickAdapter(voiceId, voice?.provider);

      const { buffer, durationMs } = await adapter.synthesize(seg.text, voiceId);
      const key = `tts/${projectId}/${seg.id}.mp3`;
      await this.storage.put(key, buffer, 'audio/mpeg');

      const startTime = cursorMs;
      const endTime = cursorMs + durationMs;
      cursorMs = endTime;

      await this.prisma.audioFile.upsert({
        where: { id: `${projectId}-${seg.id}` },
        create: {
          id: `${projectId}-${seg.id}`,
          projectId,
          type: 'tts_segment',
          storageKey: key,
          format: 'mp3',
          durationMs,
          sizeBytes: BigInt(buffer.length),
        },
        update: {
          storageKey: key,
          durationMs,
          sizeBytes: BigInt(buffer.length),
        },
      });
      await this.prisma.scriptSegment.update({
        where: { id: seg.id },
        data: { startTime, endTime },
      });
      synthesized++;

      // Progress: 50~75
      const pct = 50 + Math.round((synthesized / total) * 25);
      const event: ProgressEvent = {
        type: 'project.progress',
        projectId,
        stage: 'tts',
        progress: pct,
        message: `TTS ${synthesized}/${total}`,
        timestamp: Date.now(),
        traceId,
      };
      await this.progress.emit(event);
    }

    await this.queues.enqueueSubtitle(projectId);
    void STAGE_WEIGHTS; // referenced to satisfy imports
    void normalizeIsbn; // ditto
    return { count: synthesized, totalMs: cursorMs };
  }

  private pickAdapter(
    voiceId: string,
    provider?: string | null,
  ): VolcengineAdapter | AzureAdapter | XiaomiMimoAdapter {
    if (provider === 'xiaomi') return this.xiaomi;
    if (provider === 'volcengine') return this.volc;
    if (provider === 'azure') return this.azure;
    if (voiceId.startsWith('BV')) return this.volc;
    if (voiceId.startsWith('zh-')) return this.azure;
    if (this.xiaomi.hasVoice(voiceId)) return this.xiaomi;
    return this.azure;
  }
}
