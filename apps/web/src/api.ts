import type {
  ApiError,
  GameCommand,
  GameSnapshot,
  RoomSettings,
} from '@our-werewolf/shared';

export class ApiRequestError extends Error {
  readonly code: string;
  readonly status: number | undefined;

  constructor(message: string, code = 'unknown', status?: number) {
    super(message);
    this.name = 'ApiRequestError';
    this.code = code;
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    cache: 'no-store',
    ...init,
    credentials: 'include',
    headers: {
      accept: 'application/json',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    let error: ApiError['error'] | undefined;
    try {
      error = ((await response.json()) as ApiError).error;
    } catch {
      // A transport error may not have a JSON body.
    }
    throw new ApiRequestError(
      error?.message ?? 'Não foi possível falar com a vila.',
      error?.code,
      response.status,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function snapshotRequest(
  path: string,
  init: RequestInit = {},
): Promise<GameSnapshot> {
  const response = await request<GameSnapshot | { snapshot: GameSnapshot }>(
    path,
    init,
  );
  return 'snapshot' in response ? response.snapshot : response;
}

export const api = {
  restoreSession: () => snapshotRequest('/session'),
  createRoom: (nickname: string) =>
    snapshotRequest('/rooms', {
      method: 'POST',
      body: JSON.stringify({ nickname }),
    }),
  joinRoom: (roomCode: string, nickname: string) =>
    snapshotRequest(`/rooms/${encodeURIComponent(roomCode)}/join`, {
      method: 'POST',
      body: JSON.stringify({ nickname }),
    }),
  getSnapshot: (roomCode: string) =>
    snapshotRequest(`/rooms/${encodeURIComponent(roomCode)}/snapshot`, {
      cache: 'no-store',
    }),
  setReady: (roomCode: string, ready: boolean) =>
    snapshotRequest(`/rooms/${encodeURIComponent(roomCode)}/ready`, {
      method: 'PATCH',
      body: JSON.stringify({ ready }),
    }),
  updateSettings: (roomCode: string, settings: RoomSettings) =>
    snapshotRequest(`/rooms/${encodeURIComponent(roomCode)}/settings`, {
      method: 'PATCH',
      body: JSON.stringify(settings),
    }),
  startGame: (roomCode: string) =>
    snapshotRequest(`/rooms/${encodeURIComponent(roomCode)}/start`, {
      method: 'POST',
    }),
  removePlayer: (roomCode: string, playerId: string) =>
    snapshotRequest(
      `/rooms/${encodeURIComponent(roomCode)}/participants/${encodeURIComponent(playerId)}`,
      { method: 'DELETE' },
    ),
  leaveRoom: (roomCode: string) =>
    request<void>(`/rooms/${encodeURIComponent(roomCode)}/session`, {
      method: 'DELETE',
    }),
  sendCommand: (roomCode: string, command: GameCommand) =>
    snapshotRequest(`/rooms/${encodeURIComponent(roomCode)}/commands`, {
      method: 'POST',
      body: JSON.stringify(command),
    }),
};

export type ApiClient = typeof api;
