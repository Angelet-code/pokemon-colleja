/** REST client of the local server (`/api/*`, proxied by Vite in development). */
import {
  API_PREFIX,
  type ApiError,
  type GameModeValue,
  type ImportTeamRequest,
  type ListTeamsResponse,
  type MetaResponse,
  type RandomTeamResponse,
  type TeamContent,
  type TeamResponse,
  type ValidateTeamResponse,
} from '@colleja/protocol';

export class ApiRequestError extends Error {
  override name = 'ApiRequestError';

  constructor(
    message: string,
    readonly details: string[] = [],
  ) {
    super(message);
  }
}

const NO_SERVER = 'No se puede conectar con el servidor. ¿Está arrancado (npm run dev)?';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_PREFIX}${path}`, {
      ...init,
      headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    });
  } catch {
    throw new ApiRequestError(NO_SERVER);
  }
  // The Vite proxy answers 502/504 when the local server is not running.
  if (response.status === 502 || response.status === 504) throw new ApiRequestError(NO_SERVER);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiError | null;
    throw new ApiRequestError(body?.error ?? `Error ${response.status}`, body?.details);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});

export const api = {
  meta: () => request<MetaResponse>('/meta'),
  validateTeam: (mode: GameModeValue, team: string) =>
    request<ValidateTeamResponse>('/teams/validate', json('POST', { mode, team })),
  randomTeam: (mode: GameModeValue, seed?: string) =>
    request<RandomTeamResponse>('/teams/random', json('POST', seed ? { mode, seed } : { mode })),

  // Saved teams
  listTeams: () => request<ListTeamsResponse>('/teams'),
  getTeam: (id: string) => request<TeamResponse>(`/teams/${encodeURIComponent(id)}`),
  createTeam: (team: TeamContent) => request<TeamResponse>('/teams', json('POST', { team })),
  importTeam: (body: ImportTeamRequest) =>
    request<TeamResponse>('/teams/import', json('POST', body)),
  updateTeam: (id: string, team: TeamContent) =>
    request<TeamResponse>(`/teams/${encodeURIComponent(id)}`, json('PUT', { team })),
  deleteTeam: (id: string) =>
    request<void>(`/teams/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
