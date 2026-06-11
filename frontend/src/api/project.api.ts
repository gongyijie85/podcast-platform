import { request } from './client';
import type { ProjectDto, CreateProjectPayload, UpdateConfigPayload } from '@shared/project';
import type { PaginatedResult } from '@shared/api';

export const projectApi = {
  async create(payload: CreateProjectPayload): Promise<ProjectDto> {
    return request<ProjectDto>({ method: 'POST', url: '/api/projects', data: payload });
  },
  async get(id: string): Promise<ProjectDto> {
    return request<ProjectDto>({ method: 'GET', url: `/api/projects/${id}` });
  },
  async update(id: string, payload: UpdateConfigPayload): Promise<ProjectDto> {
    return request<ProjectDto>({ method: 'PATCH', url: `/api/projects/${id}`, data: payload });
  },
  async list(page = 1, pageSize = 20): Promise<PaginatedResult<ProjectDto>> {
    return request<PaginatedResult<ProjectDto>>({ method: 'GET', url: '/api/projects', params: { page, pageSize } });
  },
  async generate(id: string): Promise<{ accepted: true; jobIds: Record<string, string> }> {
    return request<{ accepted: true; jobIds: Record<string, string> }>({ method: 'POST', url: `/api/projects/${id}/generate` });
  },
  async cancel(id: string): Promise<{ cancelled: number }> {
    return request<{ cancelled: number }>({ method: 'POST', url: `/api/projects/${id}/cancel` });
  },
  async regenerate(id: string): Promise<{ accepted: true }> {
    return request<{ accepted: true }>({ method: 'POST', url: `/api/projects/${id}/regenerate` });
  },
};
