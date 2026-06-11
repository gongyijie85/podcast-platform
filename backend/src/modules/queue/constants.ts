// BullMQ queue names. Also used by the WebSocket progress gateway.
//
// BullMQ 5+ rejects queue names that contain ":" characters with the
// error "Queue name cannot contain :". The original `podcast:*` strings
// were written against BullMQ 4.x, which allowed it. We use the dash
// form `podcast-*` for compatibility with both Redis key naming and
// BullMQ's stricter validation.
export const QUEUE_NAMES = {
  METADATA: 'podcast-metadata',
  SCRIPT: 'podcast-script',
  TTS: 'podcast-tts',
  SUBTITLE: 'podcast-subtitle',
  MIX: 'podcast-mix',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const STAGES = ['metadata', 'script', 'tts', 'subtitle', 'mix'] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_WEIGHTS: Record<Stage, number> = {
  metadata: 0,
  script: 25,
  tts: 50,
  subtitle: 75,
  mix: 90,
};
