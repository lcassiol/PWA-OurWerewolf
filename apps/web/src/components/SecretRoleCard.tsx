import type {
  KnowledgeFact,
  PlayerSummary,
  PrivateSnapshot,
  RoleArtworkSetId,
  RoleId,
} from '@our-werewolf/shared';
import { useEffect, useState } from 'react';
import { roleCatalog } from '../catalog';
import { roleArtwork } from '../role-artwork';

const knowledgeFactLabels: Record<KnowledgeFact, string> = {
  werewolf: 'É Lobisomem.',
  'pack-target': 'É o alvo atual da alcateia.',
  werewolves: 'Alinhamento: Lobisomens.',
  village: 'Alinhamento: Cidade.',
  neutral: 'Alinhamento: Neutro.',
  lover: 'É seu amor.',
  'little-girl': 'É a Menina.',
};

export function SecretRoleCard({
  privateState,
  players,
  artworkSetId = 'realistic',
  canReveal,
}: {
  privateState: PrivateSnapshot;
  players: PlayerSummary[];
  artworkSetId?: RoleArtworkSetId;
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
          artworkSetId={artworkSetId}
          roleId={privateState.role!}
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
  artworkSetId,
  roleId,
  role,
}: {
  privateState: PrivateSnapshot;
  players: PlayerSummary[];
  artworkSetId: RoleArtworkSetId;
  roleId: RoleId;
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
      <figure className="role-artwork">
        <img
          src={roleArtwork[artworkSetId][roleId]}
          alt={`Ilustração do papel ${role.name}`}
          width="600"
          height="780"
        />
      </figure>
      <div className="role-sigil" aria-hidden="true">
        {role.mark}
      </div>
      <h2>{role.name}</h2>
      <div className="role-briefing">
        <section>
          <h3>Seu objetivo</h3>
          <p>{role.objective}</p>
        </section>
        <section>
          <h3>O que fazer</h3>
          <p>{role.short}</p>
          <p>{role.targeting}</p>
        </section>
        <section>
          <h3>Regras importantes</h3>
          <ul>
            {role.rules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </section>
      </div>
      {privateState.knownPlayers.length > 0 ? (
        <div className="secret-knowledge">
          <h3>O que você sabe</h3>
          <ul>
            {privateState.knownPlayers.map((known) => {
              const nickname =
                players.find((player) => player.id === known.playerId)
                  ?.nickname ?? 'Participante desconhecido';
              return (
                <li
                  key={`${known.playerId}-${known.fact}-${known.sourcePlayerId ?? ''}`}
                >
                  <strong>{nickname}</strong>
                  <span>
                    {known.fact === 'pack-target' && known.sourcePlayerId
                      ? `É o voto atual de ${players.find((player) => player.id === known.sourcePlayerId)?.nickname ?? 'outro Lobo'}.`
                      : knowledgeFactLabels[known.fact]}
                  </span>
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
