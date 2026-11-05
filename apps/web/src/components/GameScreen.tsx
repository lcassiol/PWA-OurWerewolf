import type {
  ActionChoice,
  AvailableAction,
  GameCommand,
  GameSnapshot,
  PlayerSummary,
} from '@our-werewolf/shared';
import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { actionLabels, phaseCopy, roleCatalog } from '../catalog';
import { formatCountdown, useCountdown } from '../hooks';
import type { NetworkState } from '../hooks';
import { ConnectionBadge } from './ConnectionBadge';
import { SecretRoleCard } from './SecretRoleCard';

type GameScreenProps = {
  snapshot: GameSnapshot;
  network: NetworkState;
  privateFresh: boolean;
  busy: boolean;
  message: string | null;
  onCommand: (command: GameCommand) => Promise<boolean>;
  onInstall: () => void;
};

export function GameScreen({
  snapshot,
  network,
  privateFresh,
  busy,
  message,
  onCommand,
  onInstall,
}: GameScreenProps) {
  const publicState = snapshot.public;
  const remaining = useCountdown(publicState.deadline);

  if (publicState.phase === 'finished') {
    return (
      <FinalScreen
        snapshot={snapshot}
        network={network}
        onInstall={onInstall}
      />
    );
  }
  if (publicState.phase === 'lobby') return null;

  const currentPhase = publicState.phase;
  const phase = phaseCopy[currentPhase];

  return (
    <main className="app-shell game-shell" id="main-content">
      <header className="topbar game-topbar">
        <div>
          <span className="brand-mark" aria-hidden="true">
            ◐
          </span>
          <span className="room-mini">Sala {publicState.roomCode}</span>
        </div>
        <ConnectionBadge state={network} />
      </header>

      <section
        className={`phase-hero phase-hero--${currentPhase}`}
        aria-labelledby="phase-title"
      >
        <div className="phase-orbit" aria-hidden="true">
          <span />
        </div>
        <p className="eyebrow">
          {phase.eyebrow} · Rodada {publicState.round}
        </p>
        <h1 id="phase-title">{phase.title}</h1>
        <p>{phase.instruction}</p>
        <div
          className="countdown"
          role="timer"
          aria-live="off"
          aria-label={`Tempo restante: ${formatCountdown(remaining)}`}
        >
          <span aria-hidden="true">{formatCountdown(remaining)}</span>
          <small>
            {remaining === null
              ? 'aguarde o servidor'
              : remaining === 0
                ? 'encerrando fase'
                : 'tempo restante'}
          </small>
        </div>
      </section>

      <div className="game-grid">
        <SecretRoleCard
          privateState={snapshot.private}
          players={publicState.players}
          canReveal={network === 'connected' && privateFresh}
        />

        <section className="panel phase-panel" aria-labelledby="action-title">
          {currentPhase === 'dawn' || currentPhase === 'day-resolution' ? (
            <AnnouncementPanel snapshot={snapshot} />
          ) : !privateFresh || network !== 'connected' ? (
            <PrivateUnavailablePanel network={network} />
          ) : snapshot.private.availableAction ? (
            <ActionPanel
              key={`${publicState.phase}-${snapshot.private.availableAction.type}`}
              action={snapshot.private.availableAction}
              players={publicState.players}
              allowNoExile={publicState.settings.allowNoExile}
              expectedVersion={publicState.version}
              expectedPhase={currentPhase}
              disabled={busy || network !== 'connected'}
              onSubmit={onCommand}
            />
          ) : (
            <WaitingPanel phase={currentPhase} />
          )}
          <p className="form-message" role="status" aria-live="polite">
            {network !== 'connected'
              ? network === 'offline'
                ? 'Sem conexão. Nenhuma ação será enviada enquanto você estiver offline.'
                : 'Reconectando. Aguarde a atualização da fase antes de agir.'
              : message}
          </p>
        </section>
      </div>

      <AliveList players={publicState.players} />
      <footer className="in-game-footer">
        <button className="text-button" type="button" onClick={onInstall}>
          Instalar Vila da Lua
        </button>
        <span>O servidor conduz fases e prazos.</span>
      </footer>
    </main>
  );
}

function ActionPanel({
  action,
  players,
  allowNoExile,
  expectedVersion,
  expectedPhase,
  disabled,
  onSubmit,
}: {
  action: AvailableAction;
  players: PlayerSummary[];
  allowNoExile: boolean;
  expectedVersion: number;
  expectedPhase: GameCommand['expectedPhase'];
  disabled: boolean;
  onSubmit: (command: GameCommand) => Promise<boolean>;
}) {
  const choices: ActionChoice[] = [action, ...(action.alternatives ?? [])];
  const [actionType, setActionType] = useState(action.type);
  const selectedAction =
    choices.find((choice) => choice.type === actionType) ?? action;
  const [selected, setSelected] = useState<string[]>([]);
  const [noExile, setNoExile] = useState(false);
  const [abstain, setAbstain] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const commandId = useRef(createCommandId());
  const copy = actionLabels[selectedAction.type];
  const validPlayers = players.filter((player) =>
    selectedAction.targets.includes(player.id),
  );
  const isDayVote = selectedAction.type === 'day-vote';
  const hasValidTargets =
    selected.length >= selectedAction.minTargets &&
    selected.length <= selectedAction.maxTargets;
  const canSubmit = hasValidTargets || noExile || abstain;

  const changeIntent = () => {
    commandId.current = createCommandId();
    setSubmitted(false);
  };

  const choose = (id: string) => {
    changeIntent();
    setNoExile(false);
    setAbstain(false);
    setSelected((current) => {
      if (current.includes(id))
        return current.filter((target) => target !== id);
      if (selectedAction.maxTargets === 1) return [id];
      return current.length < selectedAction.maxTargets
        ? [...current, id]
        : current;
    });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const confirmed = await onSubmit({
      commandId: commandId.current,
      expectedVersion,
      expectedPhase,
      action: selectedAction.type,
      targets: noExile ? ['no-exile'] : abstain ? [] : selected,
    });
    if (confirmed) {
      setSubmitted(true);
      commandId.current = createCommandId();
    }
  };

  return (
    <form className="action-form" onSubmit={(event) => void submit(event)}>
      <p className="eyebrow">Sua decisão</p>
      <h2 id="action-title">{copy.title}</h2>
      {choices.length > 1 ? (
        <div className="action-choice" role="group" aria-label="Tipo de ação">
          {choices.map((choice) => (
            <button
              className={choice.type === actionType ? 'is-selected' : ''}
              type="button"
              key={choice.type}
              aria-pressed={choice.type === actionType}
              onClick={() => {
                changeIntent();
                setActionType(choice.type);
                setSelected([]);
                setNoExile(false);
                setAbstain(false);
              }}
            >
              {actionLabels[choice.type].title}
            </button>
          ))}
        </div>
      ) : null}
      <p className="muted-copy">
        {selectedAction.maxTargets > 1
          ? `Selecione ${selectedAction.minTargets} pessoas diferentes.`
          : 'Você pode mudar a escolha enquanto a fase estiver aberta.'}
      </p>
      <fieldset className="target-list">
        <legend className="visually-hidden">Alvos disponíveis</legend>
        {validPlayers.map((player) => (
          <label
            className={
              selected.includes(player.id)
                ? 'target-option is-selected'
                : 'target-option'
            }
            key={player.id}
          >
            <input
              type={selectedAction.maxTargets === 1 ? 'radio' : 'checkbox'}
              name="target"
              value={player.id}
              aria-label={player.nickname}
              checked={selected.includes(player.id)}
              onChange={() => choose(player.id)}
            />
            <span className="target-avatar" aria-hidden="true">
              {player.nickname.slice(0, 1).toUpperCase()}
            </span>
            <span>{player.nickname}</span>
            <span className="target-check" aria-hidden="true">
              ✓
            </span>
          </label>
        ))}
        {isDayVote && allowNoExile ? (
          <label
            className={
              noExile
                ? 'target-option no-exile is-selected'
                : 'target-option no-exile'
            }
          >
            <input
              type="radio"
              name="target"
              aria-label="Não expulsar"
              checked={noExile}
              onChange={() => {
                setSelected([]);
                setNoExile(true);
                setAbstain(false);
                changeIntent();
              }}
            />
            <span className="target-avatar" aria-hidden="true">
              —
            </span>
            <span>Não expulsar</span>
            <span className="target-check" aria-hidden="true">
              ✓
            </span>
          </label>
        ) : null}
        {selectedAction.allowAbstain ? (
          <label
            className={
              abstain
                ? 'target-option abstain is-selected'
                : 'target-option abstain'
            }
          >
            <input
              type="radio"
              name="target"
              aria-label="Abster-se desta ação"
              checked={abstain}
              onChange={() => {
                setSelected([]);
                setNoExile(false);
                setAbstain(true);
                changeIntent();
              }}
            />
            <span className="target-avatar" aria-hidden="true">
              ∅
            </span>
            <span>Abster-se desta ação</span>
            <span className="target-check" aria-hidden="true">
              ✓
            </span>
          </label>
        ) : null}
      </fieldset>
      <button
        className="primary-button"
        type="submit"
        disabled={disabled || !canSubmit}
      >
        {noExile
          ? 'Confirmar sem expulsão'
          : abstain
            ? 'Confirmar abstenção'
            : copy.submit}
      </button>
      {submitted ? (
        <p className="action-confirmed" role="status">
          Decisão confirmada. Você ainda pode substituí-la até o fim.
        </p>
      ) : null}
    </form>
  );
}

function PrivateUnavailablePanel({ network }: { network: NetworkState }) {
  return (
    <div className="waiting-panel private-unavailable" aria-live="polite">
      <span className="waiting-glyph" aria-hidden="true">
        ◐
      </span>
      <p className="eyebrow">Informação protegida</p>
      <h2 id="action-title">Atualizando sua visão privada</h2>
      <p>
        {network === 'offline'
          ? 'Reconecte-se para consultar ou enviar decisões.'
          : 'Aguarde uma confirmação autorizada do servidor.'}
      </p>
    </div>
  );
}

function AnnouncementPanel({ snapshot }: { snapshot: GameSnapshot }) {
  const announcements = snapshot.public.announcements;
  const eliminated = snapshot.public.players.filter((player) => !player.alive);
  return (
    <div className="announcement-panel" aria-live="polite">
      <p className="eyebrow">Notícias da praça</p>
      <h2 id="action-title">
        {announcements.length > 0
          ? 'O que aconteceu'
          : 'A névoa ainda não abriu'}
      </h2>
      {announcements.length > 0 ? (
        <ul>
          {announcements.map((announcement, index) => (
            <li key={`${index}-${announcement}`}>{announcement}</li>
          ))}
        </ul>
      ) : (
        <p>O servidor está preparando o anúncio.</p>
      )}
      {eliminated.length > 0 ? (
        <p className="eliminated-names">
          Fora da crônica:{' '}
          {eliminated.map((player) => player.nickname).join(', ')}
        </p>
      ) : null}
    </div>
  );
}

function WaitingPanel({ phase }: { phase: GameSnapshot['public']['phase'] }) {
  const isDiscussion = phase === 'discussion';
  return (
    <div className="waiting-panel">
      <span className="waiting-glyph" aria-hidden="true">
        {isDiscussion ? '☼' : '…'}
      </span>
      <p className="eyebrow">
        {isDiscussion ? 'Converse frente a frente' : 'Sua escolha está feita'}
      </p>
      <h2 id="action-title">
        {isDiscussion
          ? 'Escute. Desconfie. Convença.'
          : 'Aguarde os outros destinos'}
      </h2>
      <p>
        {isDiscussion
          ? 'Quando o tempo terminar, a votação abrirá automaticamente.'
          : 'A fase pode terminar antes do prazo quando todas as decisões chegarem.'}
      </p>
    </div>
  );
}

function AliveList({ players }: { players: PlayerSummary[] }) {
  return (
    <section className="village-strip" aria-labelledby="village-title">
      <h2 id="village-title">Quem ainda está na crônica</h2>
      <ul>
        {players.map((player) => (
          <li className={!player.alive ? 'is-eliminated' : ''} key={player.id}>
            <span>{player.nickname.slice(0, 1).toUpperCase()}</span>
            {player.nickname}
            {!player.alive ? (
              <small>Eliminado</small>
            ) : player.connection === 'disconnected' ? (
              <small>Desconectado</small>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function FinalScreen({
  snapshot,
  network,
  onInstall,
}: {
  snapshot: GameSnapshot;
  network: NetworkState;
  onInstall: () => void;
}) {
  const winnerNames = {
    village: 'A Cidade venceu',
    werewolves: 'Os Lobisomens venceram',
    lovers: 'Os Amantes venceram',
  } as const;
  const mainWinner = snapshot.public.winner
    ? winnerNames[snapshot.public.winner]
    : 'A história terminou';

  return (
    <main className="app-shell final-shell" id="main-content">
      <header className="topbar">
        <span className="brand-name">Vila da Lua</span>
        <ConnectionBadge state={network} />
      </header>
      <section className="final-hero" aria-labelledby="final-title">
        <div className="final-moon" aria-hidden="true">
          ◯
        </div>
        <p className="eyebrow">Fim da crônica</p>
        <h1 id="final-title">{mainWinner}</h1>
        {snapshot.private.personalWinner ? (
          <p className="personal-win">
            Você também conquistou uma vitória pessoal.
          </p>
        ) : null}
      </section>
      <section className="panel final-roles" aria-labelledby="roles-title">
        <p className="eyebrow">A verdade sob cada pele</p>
        <h2 id="roles-title">Papéis revelados</h2>
        <ul>
          {(snapshot.finalRoles ?? []).map((entry) => {
            const role = roleCatalog[entry.role];
            return (
              <li
                className={entry.winner ? 'is-winner' : ''}
                key={entry.playerId}
              >
                <span className="role-sigil small" aria-hidden="true">
                  {role.mark}
                </span>
                <span>
                  <strong>{entry.nickname}</strong>
                  <small>{role.name}</small>
                </span>
                {entry.winner ? <b>Vencedor</b> : null}
              </li>
            );
          })}
        </ul>
      </section>
      {snapshot.public.announcements.length > 0 ? (
        <section className="panel chronicle" aria-labelledby="chronicle-title">
          <h2 id="chronicle-title">Últimos acontecimentos</h2>
          <ol>
            {snapshot.public.announcements.map((item, index) => (
              <li key={`${index}-${item}`}>{item}</li>
            ))}
          </ol>
        </section>
      ) : null}
      {snapshot.finalEvents && snapshot.finalEvents.length > 0 ? (
        <section className="panel chronicle" aria-labelledby="events-title">
          <h2 id="events-title">Linha do tempo decisiva</h2>
          <ol>
            {snapshot.finalEvents.map((event) => (
              <li key={`${event.sequence}-${event.type}`}>
                <strong>{event.type}</strong>
                <span>{describeFinalEvent(event.data, snapshot)}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      <button
        className="secondary-button final-install"
        type="button"
        onClick={onInstall}
      >
        Instalar para a próxima lua
      </button>
    </main>
  );
}

function describeFinalEvent(
  data: Record<string, unknown>,
  snapshot: GameSnapshot,
): string {
  const playerId =
    typeof data.participantId === 'string' ? data.participantId : null;
  const causedById =
    typeof data.causedById === 'string' ? data.causedById : null;
  const name = (id: string | null) =>
    snapshot.public.players.find((player) => player.id === id)?.nickname ?? id;
  const details = [
    playerId ? name(playerId) : null,
    typeof data.cause === 'string' ? data.cause : null,
    causedById ? `por ${name(causedById)}` : null,
    typeof data.winner === 'string' ? data.winner : null,
  ].filter(Boolean);
  return details.length > 0 ? `: ${details.join(' ')}` : '';
}

function createCommandId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}
