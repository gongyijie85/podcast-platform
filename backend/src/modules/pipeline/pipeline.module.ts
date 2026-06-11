/**
 * PipelineModule — v1.1 flow-layer module.
 *
 * Wires the 4 mock adapters (default) into the 4 InjectionTokens, and
 * exposes `PipelineService` as the public API of the module. The
 * optional `PipelineController` (TP4) is NOT registered here — it's
 * conditionally registered in `main.ts` so prod can disable it.
 *
 * The 4 tokens (`BOOK_ADAPTER`, `LLM_ADAPTER`, `TTS_ADAPTER`,
 * `STORAGE_ADAPTER`) live in `./pipeline.tokens` and are deliberately
 * `Symbol` keys so they cannot collide with the v1.0 string-keyed
 * `BookModule` / `ScriptModule` / `TtsModule` / `StorageModule`
 * providers (architecture §A7.4).
 *
 * To swap in real adapters for production, replace each `useClass`
 * with the corresponding real adapter (e.g. `OpenLibraryAdapter` for
 * `BOOK_ADAPTER`). The orchestrator does not need any changes.
 */

import { Module } from '@nestjs/common';

import { MockBookMetadataAdapter } from '../book/adapters/mock-book-metadata.adapter';
import { MockScriptGenAdapter } from '../script/adapters/mock-script-gen.adapter';
import { MockTtsAdapter } from '../tts/adapters/mock-tts.adapter';
import { LocalDiskStorageAdapter } from '../export/adapters/local-disk-storage.adapter';

import {
  BOOK_ADAPTER,
  LLM_ADAPTER,
  TTS_ADAPTER,
  STORAGE_ADAPTER,
} from './pipeline.tokens';
import { PipelineService } from './pipeline.service';
import { PipelineController } from './pipeline.controller';
import { Step1Metadata } from './steps/step1-metadata';
import { Step2Script } from './steps/step2-script';
import { Step3TtsMix } from './steps/step3-tts-mix';
import { Step4Export } from './steps/step4-export';

@Module({
  providers: [
    // Token → Mock implementation. Production deployments can re-bind
    // these to the real adapters without touching `PipelineService`.
    { provide: BOOK_ADAPTER, useClass: MockBookMetadataAdapter },
    { provide: LLM_ADAPTER, useClass: MockScriptGenAdapter },
    { provide: TTS_ADAPTER, useClass: MockTtsAdapter },
    { provide: STORAGE_ADAPTER, useClass: LocalDiskStorageAdapter },

    // The 4 injectable step wrappers (they wrap the standalone step
    // functions for Nest consumers; the orchestrator uses the
    // standalone functions directly for testability).
    Step1Metadata,
    Step2Script,
    Step3TtsMix,
    Step4Export,

    // The orchestrator. This is the ONLY public API of the module.
    PipelineService,
  ],
  controllers: [PipelineController],
  exports: [PipelineService],
})
export class PipelineModule {}
