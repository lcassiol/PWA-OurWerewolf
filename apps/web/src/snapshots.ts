import type { GameSnapshot } from '@our-werewolf/shared';

function snapshotGeneration(snapshot: GameSnapshot): number {
  return snapshot.public.status === 'lobby' ? 0 : 1;
}

export function selectCurrentSnapshot(
  current: GameSnapshot | null,
  incoming: GameSnapshot,
): GameSnapshot {
  if (!current) return incoming;
  if (current.public.roomCode !== incoming.public.roomCode) return current;

  const currentGeneration = snapshotGeneration(current);
  const incomingGeneration = snapshotGeneration(incoming);
  if (incomingGeneration < currentGeneration) return current;
  if (incomingGeneration > currentGeneration) return incoming;

  return incoming.public.version >= current.public.version ? incoming : current;
}

export function isSessionInvalid(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { code?: unknown; status?: unknown };
  return (
    candidate.code === 'unauthorized' ||
    candidate.code === 'forbidden' ||
    candidate.status === 401 ||
    candidate.status === 403
  );
}

export function requiresSnapshotRefresh(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error.code === 'stale_command' || error.code === 'phase_closed')
  );
}

export async function recoverRejectedCommand(
  error: unknown,
  refresh: () => Promise<GameSnapshot>,
  applySnapshot: (snapshot: GameSnapshot) => void,
  clearSession: () => void,
): Promise<void> {
  if (isSessionInvalid(error)) {
    clearSession();
    return;
  }
  if (!requiresSnapshotRefresh(error)) return;

  try {
    applySnapshot(await refresh());
  } catch (refreshError) {
    if (isSessionInvalid(refreshError)) clearSession();
  }
}
