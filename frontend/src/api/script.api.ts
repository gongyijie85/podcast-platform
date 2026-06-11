import { request } from './client';
import type { ScriptDto, SaveScriptPayload } from '@shared/script';

export const scriptApi = {
  async get(projectId: string): Promise<ScriptDto | null> {
    return request<ScriptDto | null>({ method: 'GET', url: `/api/projects/${projectId}/script` });
  },
  async save(projectId: string, payload: SaveScriptPayload): Promise<ScriptDto> {
    return request<ScriptDto>({ method: 'PUT', url: `/api/projects/${projectId}/script`, data: payload });
  },
};
