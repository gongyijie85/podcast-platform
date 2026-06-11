import { ApiResponse, PaginatedResult } from '@shared/api';

export type ApiOk<T> = ApiResponse<T>;
export type PagedOk<T> = ApiResponse<PaginatedResult<T>>;
