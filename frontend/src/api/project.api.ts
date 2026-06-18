import { request } from './client';
import type {
  ProjectDto,
  CreateProjectPayload,
  UpdateConfigPayload,
  SyncProjectsResult,
  ShareLinkDto,
  GenerateProjectPayload,
  RegenerateProjectPayload,
} from '@shared/project';
import type { PaginatedResult } from '@shared/api';

export const projectApi = {
  async create(payload: CreateProjectPayload): Promise<ProjectDto> {
    return request<ProjectDto>({ method: 'POST', url: '/projects', data: payload });
  },
  async get(id: string): Promise<ProjectDto> {
    return request<ProjectDto>({ method: 'GET', url: `/projects/${id}` });
  },
  async update(id: string, payload: UpdateConfigPayload): Promise<ProjectDto> {
    return request<ProjectDto>({ method: 'PATCH', url: `/projects/${id}`, data: payload });
  },
  async list(page = 1, pageSize = 20): Promise<PaginatedResult<ProjectDto>> {
    return request<PaginatedResult<ProjectDto>>({ method: 'GET', url: '/projects', params: { page, pageSize } });
  },
  async generate(
    id: string,
    payload?: GenerateProjectPayload,
  ): Promise<{ accepted: true; jobIds: Record<string, string>; project?: ProjectDto }> {
    return request<{ accepted: true; jobIds: Record<string, string>; project?: ProjectDto }>({
      method: 'POST',
      url: `/projects/${id}/generate`,
      data: payload ?? {},
    });
  },
  async cancel(id: string): Promise<{ cancelled: number; project: ProjectDto }> {
    return request<{ cancelled: number; project: ProjectDto }>({ method: 'POST', url: `/projects/${id}/cancel` });
  },
  async regenerate(
    id: string,
    payload?: RegenerateProjectPayload,
  ): Promise<{ accepted: true; jobIds: Record<string, string>; project: ProjectDto }> {
    return request<{ accepted: true; jobIds: Record<string, string>; project: ProjectDto }>({
      method: 'POST',
      url: `/projects/${id}/regenerate`,
      data: payload ?? {},
    });
  },
  async remove(id: string): Promise<null> {
    return request<null>({ method: 'DELETE', url: `/projects/${id}` });
  },
  async sync(projectIds: string[]): Promise<SyncProjectsResult> {
    return request<SyncProjectsResult>({ method: 'POST', url: '/projects/sync', data: { projectIds } });
  },
  async createShare(id: string): Promise<ShareLinkDto> {
    return request<ShareLinkDto>({ method: 'POST', url: `/projects/${id}/share` });
  },
};
