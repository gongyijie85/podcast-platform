import type { BookMetadata } from './book';
import type { ProjectDto } from './project';

export type JobType = 'metadata' | 'script' | 'tts' | 'subtitle' | 'mix' | 'export';
export type JobStatus = 'pending' | 'active' | 'completed' | 'failed' | 'cancelled';

export interface JobDto {
  id: string;
  projectId: string;
  type: JobType;
  status: JobStatus;
  progress: number; // 0-100
  payload?: Record<string, unknown> | null;
  error?: string | null;
  createdAt: string;
  finishedAt?: string | null;
}

export interface MetadataJobResult {
  jobId: string;
  items: BookMetadata[];
  failed: string[]; // ISBNs that failed all retries
}

export interface ProgressEvent {
  type: 'project.progress';
  projectId: string;
  stage: 'metadata' | 'script' | 'tts' | 'subtitle' | 'mix';
  progress: number;
  message: string;
  timestamp: number;
  traceId: string;
}

export interface GenerateTriggerResponse {
  accepted: true;
  project: ProjectDto;
}
