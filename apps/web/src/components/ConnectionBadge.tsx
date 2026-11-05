import type { NetworkState } from '../hooks';

const labels: Record<NetworkState, string> = {
  connected: 'Conectado',
  reconnecting: 'Reconectando',
  offline: 'Offline',
};

export function ConnectionBadge({ state }: { state: NetworkState }) {
  return (
    <div
      className={`connection-badge connection-badge--${state}`}
      role="status"
      aria-live="polite"
    >
      <span className="connection-badge__dot" aria-hidden="true" />
      {labels[state]}
    </div>
  );
}
