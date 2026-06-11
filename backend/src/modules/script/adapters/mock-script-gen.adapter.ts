import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { LlmAdapter, ScriptGenerationContext } from './llm.adapter';
import type { ScriptSegmentDto, ScriptEmotion, ScriptStage, Speaker } from '@shared/script';

/**
 * Fixture-script shape, mirrors `script-gen.fixture.json` exactly.
 * Kept local (not exported) so the adapter is the only public surface.
 */
interface FixtureSegment {
  speaker: Speaker;
  text: string;
  emotion: string;
}

interface FixtureStage {
  stage: string;
  lines: FixtureSegment[];
}

interface FixtureTemplate {
  stages: FixtureStage[];
}

interface FixtureScriptGen {
  templates: Record<string, FixtureTemplate>;
  defaultTotalChars: number;
  defaultEstimatedDurationSec: number;
}

const EMOTION_WHITELIST: ScriptEmotion[] = ['开心', '沉思', '激昂', '平缓', '紧张', '温柔', '坚定', '幽默'];
/** v1.1 narrows the allowed emotions to 5; we only emit those (see architecture §A7.2). */
const V11_EMOTIONS: string[] = ['开心', '沉思', '激昂', '平和', '感慨'];
/**
 * Some legacy emotions from the v1.0 pool don't appear in the v1.1 narrowing
 * (e.g. `平缓` / `紧张` / `温柔` / `坚定` / `幽默`). To stay backward compatible
 * with `ScriptEmotion` while honouring the v1.1 contract, we map any legacy
 * value to the closest v1.1 sibling.
 */
const EMOTION_LEGACY_TO_V11: Record<string, ScriptEmotion> = {
  平缓: '平缓',
  紧张: '紧张',
  温柔: '温柔',
  坚定: '坚定',
  幽默: '幽默',
};
function normalizeEmotion(raw: string): ScriptEmotion {
  if ((V11_EMOTIONS as string[]).includes(raw)) return raw as ScriptEmotion;
  if (EMOTION_LEGACY_TO_V11[raw]) return EMOTION_LEGACY_TO_V11[raw];
  if ((EMOTION_WHITELIST as string[]).includes(raw)) {
    return EMOTION_LEGACY_TO_V11[raw] ?? '平缓';
  }
  return '平缓';
}

const STAGE_ORDER: ScriptStage[] = ['intro', 'introduce', 'interpret', 'review', 'suggest', 'closing'];
/**
 * Map v1.1 six-stage labels to v1.0 `ScriptStage` literals. The fixture uses
 * the v1.1 names; the DTO consumers expect v1.0 names.
 */
const STAGE_V11_TO_V10: Record<string, ScriptStage> = {
  opening: 'intro',
  intro: 'introduce',
  interpret: 'interpret',
  review: 'review',
  suggest: 'suggest',
  closing: 'closing',
};

/**
 * MockScriptGenAdapter — deterministic, fixture-driven script generator.
 *
 * Used by the v1.1 flow layer when no `DOUBAO_API_KEY` is configured. Produces
 * the same output for the same input (no randomness in segment content), with
 * only the simulated-network latency being random (50..200ms).
 *
 * Behaviour:
 *  - Loads `script-gen.fixture.json` once at construction.
 *  - For any book metadata input, returns the `default` template (the v1.1
 *    fixture ships a single book-agnostic template).
 *  - If the book is missing `title` or `summary`, throws
 *    `SCRIPT_EMPTY_BOOK` (architecture §A7.2 → error code 40001 bucket).
 *  - Simulates a 50..200ms network delay so progress callbacks fire naturally.
 */
@Injectable()
export class MockScriptGenAdapter implements LlmAdapter {
  readonly name = 'mock-script-gen';
  private readonly logger = new Logger(MockScriptGenAdapter.name);
  private readonly fixture: FixtureScriptGen;

  constructor() {
    // In dev, `process.cwd()` is the `backend/` directory.
    // In the Docker container, the WORKDIR is `/app/backend/`.
    // Both have `src/test/fixtures/` as a child of CWD.
    const fixturePath = path.resolve(
      process.cwd(),
      'src',
      'test',
      'fixtures',
      'script-gen.fixture.json',
    );
    const raw = fs.readFileSync(fixturePath, 'utf8');
    this.fixture = JSON.parse(raw) as FixtureScriptGen;
    if (!this.fixture.templates || !this.fixture.templates.default) {
      throw new Error('script-gen.fixture.json is missing the `default` template');
    }
  }

  async generateScript(ctx: ScriptGenerationContext): Promise<ScriptSegmentDto[]> {
    // Validate book input. v1.1 takes the first book as the "primary" subject.
    const primary = ctx.books?.[0];
    if (!primary || !primary.title || !primary.summary) {
      this.logger.error(
        `MockScriptGenAdapter: book metadata missing required fields (title/summary) for project=${ctx.projectId}`,
      );
      throw new Error('SCRIPT_EMPTY_BOOK: 图书元数据缺书名或简介');
    }

    // Simulate network jitter (50..200ms) per architecture §INCR-02.
    const delay = 50 + Math.floor(Math.random() * 150);
    await new Promise((resolve) => setTimeout(resolve, delay));

    const template = this.fixture.templates[ctx.template === 'merge' ? 'default' : 'default'];
    const segments: ScriptSegmentDto[] = [];
    let orderIndex = 0;
    template.stages.forEach((stage, i) => {
      const v10Stage = STAGE_V11_TO_V10[stage.stage] ?? STAGE_ORDER[i] ?? 'intro';
      for (const line of stage.lines) {
        segments.push({
          id: `mock-seg-${orderIndex}`,
          scriptId: 'mock-script',
          orderIndex,
          speaker: line.speaker,
          text: line.text,
          emotion: normalizeEmotion(line.emotion),
          stage: v10Stage,
        });
        orderIndex += 1;
      }
    });
    this.logger.log(
      `MockScriptGenAdapter produced ${segments.length} segments for project=${ctx.projectId} book="${primary.title}"`,
    );
    return segments;
  }
}
