/**
 * Pipeline injection tokens.
 *
 * Each adapter (book metadata / LLM / TTS / storage) is a v1.0 interface with
 * multiple implementations. The v1.1 flow layer registers these tokens in
 * `PipelineModule` and binds the mock implementations by default. Production
 * deployments can rebind the same tokens to real adapters without touching
 * `PipelineService` itself.
 *
 * IMPORTANT: These are `Symbol` tokens (not strings) to avoid accidental
 * collisions with v1.0's string-keyed Nest providers in the book / script /
 * tts / storage modules. Each module's real adapter (OpenLibraryAdapter,
 * DoubaoAdapter, etc.) is bound to its OWN class-based token and remains
 * untouched by this increment.
 */

export const BOOK_ADAPTER = Symbol('PIPELINE_BOOK_ADAPTER');
export const LLM_ADAPTER = Symbol('PIPELINE_LLM_ADAPTER');
export const TTS_ADAPTER = Symbol('PIPELINE_TTS_ADAPTER');
export const STORAGE_ADAPTER = Symbol('PIPELINE_STORAGE_ADAPTER');

/** Tuple of all four tokens for `providers.forEach` style registration. */
export const PIPELINE_ADAPTER_TOKENS = [
  BOOK_ADAPTER,
  LLM_ADAPTER,
  TTS_ADAPTER,
  STORAGE_ADAPTER,
] as const;

export type PipelineAdapterToken = typeof PIPELINE_ADAPTER_TOKENS[number];
