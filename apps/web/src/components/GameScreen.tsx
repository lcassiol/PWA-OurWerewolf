import type {
  ActionChoice,
  AvatarId,
  AvailableAction,
  FinalEvent,
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
import { AvatarPicker } from './AvatarPicker';
import { ParticipantAvatar } from './ParticipantAvatar';
import { SecretRoleCard } from './SecretRoleCard';

type GameScreenProps = {
  snapshot: GameSnapshot;
  network: NetworkState;
  privateFresh: boolean;
  busy: boolean;
  message: string | null;
  onCommand: (command: GameCommand) => Promise<boolean>;
  onReadyForVote: () => Promise<void>;
  onAcknowledgeDayResolution: () => Promise<void>;
  onAvatarChange: (avatarId: AvatarId) => Promise<void>;
  onReturn: () => Promise<void>;
  onInstall: () => void;
};

export function GameScreen({
  snapshot,
  network,
  privateFresh,
  busy,
  message,
  onCommand,
  onReadyForVote,
  onAcknowledgeDayResolution,
  onAvatarChange,
  onReturn,
  onInstall,
}: GameScreenProps) {
  const publicState = snapshot.public;
  const remaining = useCountdown(publicState.deadline);

  if (publicState.phase === 'finished') {
    return (
      <FinalScreen
        snapshot={snapshot}
        network={network}
        busy={busy}
        message={message}
        onReturn={onReturn}
        onAvatarChange={onAvatarChange}
        onInstall={onInstall}
      />
    );
  }
  if (publicState.phase === 'lobby') return null;

  const currentPhase = publicState.phase;
  const phase = phaseCopy[currentPhase];
  const selfAlive = publicState.players.find(
    (player) => player.id === snapshot.private.playerId,
  )?.alive;

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
            <AnnouncementPanel
              snapshot={snapshot}
              disabled={busy || network !== 'connected'}
              onAcknowledge={onAcknowledgeDayResolution}
            />
          ) : currentPhase === 'discussion' ? (
            <DiscussionPanel
              readiness={publicState.discussionReadiness}
              ready={snapshot.private.readyForVote}
              canReady={Boolean(selfAlive)}
              disabled={busy || network !== 'connected'}
              onReady={onReadyForVote}
            />
          ) : !privateFresh || network !== 'connected' ? (
            <PrivateUnavailablePanel network={network} />
          ) : snapshot.private.availableAction ? (
            <ActionPanel
              key={`${publicState.phase}-${snapshot.private.availableAction.type}`}
              action={snapshot.private.availableAction}
              players={publicState.players}
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

      <AliveList
        players={publicState.players}
        selfId={snapshot.private.playerId}
        disabled={busy || network !== 'connected'}
        onAvatarChange={onAvatarChange}
      />
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
  expectedVersion,
  expectedPhase,
  disabled,
  onSubmit,
}: {
  action: AvailableAction;
  players: PlayerSummary[];
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
  const canSubmit = hasValidTargets || abstain;

  const changeIntent = () => {
    commandId.current = createCommandId();
    setSubmitted(false);
  };

  const choose = (id: string) => {
    changeIntent();
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
      targets: abstain ? [] : selected,
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
                setAbstain(false);
              }}
            >
              {actionLabels[choice.type].title}
            </button>
          ))}
        </div>
      ) : null}
      <p className="muted-copy">
        {copy.instruction ??
          (selectedAction.maxTargets > 1
            ? `Selecione ${selectedAction.minTargets} pessoas diferentes.`
            : 'Você pode mudar a escolha enquanto a fase estiver aberta.')}
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
            <ParticipantAvatar
              avatarId={player.avatarId}
              className="target-avatar"
            />
            <span>{player.nickname}</span>
            <span className="target-check" aria-hidden="true">
              ✓
            </span>
          </label>
        ))}
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
        className={`primary-button${isDayVote && submitted ? ' is-confirmed' : ''}`}
        type="submit"
        disabled={disabled || !canSubmit}
      >
        {abstain ? 'Confirmar abstenção' : copy.submit}
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

function AnnouncementPanel({
  snapshot,
  disabled,
  onAcknowledge,
}: {
  snapshot: GameSnapshot;
  disabled: boolean;
  onAcknowledge: () => Promise<void>;
}) {
  const announcements = snapshot.public.announcements;
  const acknowledgement = snapshot.public.dayResolutionAcknowledgement;
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
      {snapshot.public.phase === 'day-resolution' && acknowledgement ? (
        <div className="day-resolution-confirmation">
          <p className="discussion-ready-count" aria-live="polite">
            {acknowledgement.acknowledgedCount} de{' '}
            {acknowledgement.requiredCount} confirmaram
          </p>
          <p>
            A próxima rodada começa quando todos confirmarem que viram o resumo.
          </p>
          <button
            className="primary-button"
            type="button"
            disabled={disabled || snapshot.private.acknowledgedDayResolution}
            onClick={() => void onAcknowledge()}
          >
            {snapshot.private.acknowledgedDayResolution
              ? 'OK confirmado'
              : 'OK, continuar'}
          </button>
        </div>
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
          : 'Aguarde as ações dos jogadores'}
      </h2>
      <p>
        {isDiscussion
          ? 'Quando o tempo terminar, a votação abrirá automaticamente.'
          : 'A fase pode terminar antes do prazo quando todas as decisões chegarem.'}
      </p>
    </div>
  );
}

function DiscussionPanel({
  readiness,
  ready,
  canReady,
  disabled,
  onReady,
}: {
  readiness: GameSnapshot['public']['discussionReadiness'];
  ready: boolean;
  canReady: boolean;
  disabled: boolean;
  onReady: () => Promise<void>;
}) {
  return (
    <div className="waiting-panel discussion-ready-panel">
      <span className="waiting-glyph" aria-hidden="true">
        ☼
      </span>
      <p className="eyebrow">Converse frente a frente</p>
      <h2 id="action-title">Escute. Desconfie. Convença.</h2>
      <p>
        A votação começa quando a maioria estiver pronta ou quando o tempo
        terminar.
      </p>
      {readiness ? (
        <p className="discussion-ready-count" aria-live="polite">
          {readiness.readyCount} de {readiness.requiredCount} prontos para votar
        </p>
      ) : null}
      {canReady ? (
        <button
          className={ready ? 'secondary-button' : 'primary-button'}
          type="button"
          disabled={disabled || ready}
          onClick={() => void onReady()}
        >
          {ready ? 'Pronto para votar' : 'Estou pronto para votar'}
        </button>
      ) : (
        <p>Jogadores eliminados acompanham a decisão da vila.</p>
      )}
    </div>
  );
}

function AliveList({
  players,
  selfId,
  disabled,
  onAvatarChange,
}: {
  players: PlayerSummary[];
  selfId: string;
  disabled: boolean;
  onAvatarChange: (avatarId: AvatarId) => Promise<void>;
}) {
  return (
    <section className="village-strip" aria-labelledby="village-title">
      <h2 id="village-title">Quem ainda está na crônica</h2>
      <ul>
        {players.map((player) => (
          <li className={!player.alive ? 'is-eliminated' : ''} key={player.id}>
            {player.id === selfId ? (
              <AvatarPicker
                avatarId={player.avatarId}
                nickname={player.nickname}
                className="village-avatar"
                disabled={disabled}
                onSelect={onAvatarChange}
              />
            ) : (
              <ParticipantAvatar
                avatarId={player.avatarId}
                className="village-avatar"
              />
            )}
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
  busy,
  message,
  onReturn,
  onAvatarChange,
  onInstall,
}: {
  snapshot: GameSnapshot;
  network: NetworkState;
  busy: boolean;
  message: string | null;
  onReturn: () => Promise<void>;
  onAvatarChange: (avatarId: AvatarId) => Promise<void>;
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
  const self = snapshot.public.players.find(
    (player) => player.id === snapshot.private.playerId,
  );

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
        {self ? (
          <div className="final-avatar-picker">
            <AvatarPicker
              avatarId={self.avatarId}
              nickname={self.nickname}
              className="village-avatar"
              disabled={busy || network !== 'connected'}
              onSelect={onAvatarChange}
            />
            <span>Seu avatar</span>
          </div>
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
              <FinalEventItem
                event={event}
                snapshot={snapshot}
                key={`${event.sequence}-${event.type}`}
              />
            ))}
          </ol>
        </section>
      ) : null}
      <div className="final-actions">
        <button
          className="primary-button"
          type="button"
          disabled={busy || network !== 'connected'}
          onClick={() => void onReturn()}
        >
          {snapshot.host ? 'Voltar para a sala' : 'Voltar para sala ou início'}
        </button>
        <p className="form-message" role="status" aria-live="polite">
          {network !== 'connected'
            ? 'Reconecte-se para voltar à sala ou à página inicial.'
            : message}
        </p>
        <button
          className="secondary-button final-install"
          type="button"
          onClick={onInstall}
        >
          Instalar para a próxima lua
        </button>
      </div>
    </main>
  );
}

function FinalEventItem({
  event,
  snapshot,
}: {
  event: FinalEvent;
  snapshot: GameSnapshot;
}) {
  const copy = describeFinalEvent(event, snapshot);
  return (
    <li>
      <strong>{copy.title}</strong>
      <span>{copy.description}</span>
    </li>
  );
}

function describeFinalEvent(
  event: FinalEvent,
  snapshot: GameSnapshot,
): { title: string; description: string } {
  const { data } = event;
  const name = (id: string | null) =>
    snapshot.public.players.find((player) => player.id === id)?.nickname ??
    'Um jogador';
  const id = (key: string) =>
    typeof data[key] === 'string' ? data[key] : null;
  const participant = name(id('participantId'));

  if (event.type === 'elimination') {
    const cause = typeof data.cause === 'string' ? data.cause : '';
    const causedBy = id('causedById');
    const descriptions: Record<string, string> = {
      'wolf-attack': `${participant} foi eliminado pelo ataque da alcateia.`,
      poison: `${participant} foi eliminado pelo veneno da Bruxa.`,
      exile: `${participant} foi expulso pela votação da vila.`,
      lover: `${participant} morreu após perder seu amor.`,
      'guardian-intercept': `${participant} se sacrificou ao interceptar o ataque da alcateia.`,
      'hunter-shot': `${participant} foi atingido pelo último disparo${causedBy ? ` de ${name(causedBy)}` : ' do Caçador'}.`,
    };
    return {
      title: 'Eliminação',
      description:
        descriptions[cause] ?? `${participant} foi eliminado da partida.`,
    };
  }
  if (event.type === 'lovers') {
    const lovers = Array.isArray(data.players)
      ? data.players.filter((item): item is string => typeof item === 'string')
      : [];
    return {
      title: 'Laço dos amantes',
      description:
        lovers.length === 2
          ? `${name(lovers[0]!)} e ${name(lovers[1]!)} foram unidos pelo Cupido.`
          : 'O Cupido uniu dois destinos durante a primeira noite.',
    };
  }
  if (event.type === 'wolf-target-locked' || event.type === 'wolf-target') {
    const wolfTarget = id('targetId') ?? id('playerId');
    return {
      title: 'Decisão da alcateia',
      description: wolfTarget
        ? `A alcateia escolheu ${name(wolfTarget)} como alvo.`
        : 'A alcateia não conseguiu definir um alvo.',
    };
  }
  if (event.type === 'wolf-tie')
    return {
      title: 'Empate da alcateia',
      description: 'Os Lobisomens dividiram seus votos e não atacaram ninguém.',
    };
  if (event.type === 'witch-heal')
    return {
      title: 'Poção de cura',
      description: `A Bruxa usou sua cura para salvar ${participant}.`,
    };
  if (event.type === 'witch-poison')
    return {
      title: 'Poção de veneno',
      description: `A Bruxa envenenou ${participant}.`,
    };
  if (event.type === 'doctor-protect')
    return {
      title: 'Proteção do Médico',
      description: `O Médico protegeu ${participant} durante a noite.`,
    };
  if (event.type === 'guardian-intercept')
    return {
      title: 'Sacrifício do Guardião',
      description: `${name(id('guardianId'))} interceptou o ataque dirigido a ${name(id('guardedPlayerId'))}.`,
    };
  if (event.type === 'little-girl-random') {
    const detected =
      typeof data.detectionRoll === 'number' && data.detectionRoll < 0.25;
    return {
      title: 'Espionagem da Menina',
      description: `${name(id('littleGirlId'))} espionou a alcateia${detected ? ' e foi descoberta pelos Lobisomens' : ' sem ser descoberta'}.`,
    };
  }
  if (event.type === 'day-vote-result') {
    const exiled = id('exiledPlayerId');
    const reasons: Record<string, string> = {
      'no-exile': 'a opção sem expulsão venceu',
      tie: 'a votação terminou empatada',
      'no-votes': 'nenhum voto foi confirmado',
    };
    return {
      title: 'Resultado da votação',
      description: exiled
        ? `${name(exiled)} foi escolhido pela vila para deixar a partida.`
        : `Ninguém foi expulso: ${reasons[String(data.reason)] ?? 'não houve uma decisão válida'}.`,
    };
  }
  if (event.type === 'abstention')
    return {
      title: 'Ação não realizada',
      description: `${participant} não confirmou sua ação antes do encerramento da etapa.`,
    };
  if (event.type === 'game-finished') {
    const winners: Record<string, string> = {
      village: 'A Vila eliminou todos os Lobisomens e venceu a partida.',
      werewolves: 'Os Lobisomens alcançaram a paridade e venceram a partida.',
      lovers: 'Os Amantes sobreviveram como o último par e venceram a partida.',
    };
    return {
      title: 'Fim da partida',
      description:
        winners[String(data.winner)] ?? 'A partida chegou ao seu desfecho.',
    };
  }
  if (event.type === 'no-exile')
    return {
      title: 'Dia sem expulsão',
      description: 'A vila encerrou o dia sem expulsar nenhum jogador.',
    };
  return {
    title: 'Acontecimento da partida',
    description: 'O servidor registrou uma ação decisiva para o resultado.',
  };
}

function createCommandId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}
