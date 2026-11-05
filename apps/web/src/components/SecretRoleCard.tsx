import type { PlayerSummary, PrivateSnapshot } from '@our-werewolf/shared';
import { useEffect, useState } from 'react';
import { roleCatalog } from '../catalog';

export function SecretRoleCard({
  privateState,
  players,
  canReveal,
}: {
  privateState: PrivateSnapshot;
  players: PlayerSummary[];
  canReveal: boolean;
}) {
  const role = privateState.role ? roleCatalog[privateState.role] : null;

  if (!role) return null;

  return (
    <section className="secret-card" aria-label="Sua carta secreta">
      {canReveal ? (
        <RevealableSecret
          privateState={privateState}
          players={players}
          role={role}
        />
      ) : (
        <SecretCover canReveal={false} onReveal={() => undefined} />
      )}
    </section>
  );
}

function RevealableSecret({
  privateState,
  players,
  role,
}: {
  privateState: PrivateSnapshot;
  players: PlayerSummary[];
  role: (typeof roleCatalog)[keyof typeof roleCatalog];
}) {
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const hideWhenInvisible = () => {
      if (document.visibilityState !== 'visible') setRevealed(false);
    };
    const hide = () => setRevealed(false);
    document.addEventListener('visibilitychange', hideWhenInvisible);
    window.addEventListener('blur', hide);
    return () => {
      document.removeEventListener('visibilitychange', hideWhenInvisible);
      window.removeEventListener('blur', hide);
    };
  }, []);

  if (!revealed)
    return <SecretCover canReveal onReveal={() => setRevealed(true)} />;

  return (
    <div className="secret-card__content">
      <p className="eyebrow">Sua identidade</p>
      <div className="role-sigil" aria-hidden="true">
        {role.mark}
      </div>
      <h2>{role.name}</h2>
      <p>{privateState.objective ?? role.objective}</p>
      {privateState.knownPlayers.length > 0 ? (
        <div className="secret-knowledge">
          <h3>O que você sabe</h3>
          <ul>
            {privateState.knownPlayers.map((known) => {
              const nickname =
                players.find((player) => player.id === known.playerId)
                  ?.nickname ?? 'Participante desconhecido';
              return (
                <li key={`${known.playerId}-${known.fact}`}>
                  <strong>{nickname}</strong>
                  <span>{known.fact}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      <button
        className="secondary-button"
        type="button"
        onClick={() => setRevealed(false)}
      >
        Ocultar minha carta
      </button>
    </div>
  );
}

function SecretCover({
  canReveal,
  onReveal,
}: {
  canReveal: boolean;
  onReveal: () => void;
}) {
  return (
    <div className="secret-card__cover">
      <span className="cover-glyph" aria-hidden="true">
        ◐
      </span>
      <p className="eyebrow">Somente para seus olhos</p>
      <h2>Sua carta está coberta</h2>
      <p>Afaste outros olhares antes de revelar seu papel.</p>
      <button
        className="secondary-button"
        type="button"
        onClick={onReveal}
        disabled={!canReveal}
      >
        {canReveal ? 'Revelar minha carta' : 'Aguardando conexão segura'}
      </button>
    </div>
  );
}
