// Cross-cutting API envelope (both client and server reference this).
// Success:  { code: 0,    data: T,         message: 'ok',      traceId: 'uuid' }
// Failure:  { code: 1xxx+, data: null,      message: '...',     traceId: 'uuid' }

export interface ApiSuccess<T> {
  code: 0;
  data: T;
  message: 'ok';
  traceId: string;
}

export interface ApiFailure<T = null> {
  code: number;
  data: T;
  message: string;
  traceId: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure<null>;

/** Paginated list wrapper. */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Pagination query DTO. */
export interface PaginationQuery {
  page?: number;
  pageSize?: number;
}

/** Common error code buckets (see architecture §3.4). */
export enum ErrorCode {
  // 1xxx generic
  BAD_REQUEST = 10001,
  UNAUTHORIZED = 10002,
  FORBIDDEN = 10003,
  NOT_FOUND = 10004,
  RATE_LIMITED = 10005,
  // 2xxx user
  EMAIL_REGISTERED = 20001,
  BAD_CREDENTIALS = 20002,
  TOKEN_EXPIRED = 20003,
  // 3xxx ISBN
  ISBN_INVALID = 30001,
  METADATA_FETCH_FAILED = 30002,
  RETRY_EXCEEDED = 30003,
  // 4xxx LLM
  LLM_FAILED = 40001,
  SCRIPT_LENGTH = 40002,
  CONTENT_REJECTED = 40003,
  // 5xxx TTS
  VOICE_NOT_FOUND = 50001,
  TTS_FAILED = 50002,
  PREVIEW_LIMIT = 50003,
  // 6xxx job
  JOB_NOT_FOUND = 60001,
  JOB_FINISHED = 60002,
  CANCEL_FAILED = 60003,
  // 9xxx system
  INTERNAL_ERROR = 90001,
  THIRD_PARTY_TIMEOUT = 90002,
  STORAGE_FAILED = 90003,
}
