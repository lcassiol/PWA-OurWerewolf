import type {
  AvatarId,
  GameSnapshot,
  RoleId,
  RoomSettings,
} from '@our-werewolf/shared';
import { useRef, useState } from 'react';
import {
  gameRuleCatalog,
  roleCatalog,
  specialRoleIds,
  werewolfCount,
} from '../catalog';
import type { NetworkState } from '../hooks';
import { ConnectionBadge } from './ConnectionBadge';
import { ParticipantAvatar } from './ParticipantAvatar';
import { AvatarPicker } from './AvatarPicker';

type LobbyScreenProps = {
  snapshot: GameSnapshot;
  network: NetworkState;
  busy: boolean;
  message: string | null;
  onReady: (ready: boolean) => Promise<void>;
  onAvatarChange: (avatarId: AvatarId) => Promise<void>;
  onSettings: (settings: RoomSettings) => Promise<void>;
  onStart: () => Promise<void>;
  onRemove: (playerId: string) => Promise<void>;
  onLeave: () => Promise<void>;
  onInstall: () => void;
};

const startBlockerLabels: Record<string, string> = {
  'player-count': 'São necessários de 6 a 20 jogadores.',
  'players-not-ready': 'Todos os jogadores precisam estar prontos.',
  'invalid-composition': 'A composição de papéis é inválida.',
  'host-disconnected': 'O anfitrião precisa estar conectado.',
};

const defensiveRoles = new Set<RoleId>(['witch', 'doctor', 'guardian']);

function balancedRoleSuggestion(playerCount: number): RoleId[] {
  const targetCount = Math.min(
    playerCount <= 8 ? 2 : playerCount <= 12 ? 3 : playerCount <= 16 ? 4 : 5,
    playerCount - werewolfCount(playerCount) - 1,
  );
  const maxDefensiveRoles = playerCount <= 12 ? 1 : 2;
  const shuffled = [...specialRoleIds];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [
      shuffled[randomIndex]!,
      shuffled[index]!,
    ];
  }

  const suggestion: RoleId[] = [];
  let defensiveCount = 0;
  for (const role of shuffled) {
    if (defensiveRoles.has(role) && defensiveCount >= maxDefensiveRoles)
      continue;
    suggestion.push(role);
    if (defensiveRoles.has(role)) defensiveCount += 1;
    if (suggestion.length === targetCount) break;
  }
  return suggestion;
}

export function LobbyScreen(props: LobbyScreenProps) {
  const { snapshot, network } = props;
  const { public: publicState, private: privateState, host } = snapshot;
  const self = publicState.players.find(
    (player) => player.id === privateState.playerId,
  );
  const [shareMessage, setShareMessage] = useState('');

  const share = async () => {
    const text = `Entre na minha partida de Vila da Lua com o código ${publicState.roomCode}`;
    try {
      if (navigator.share)
        await navigator.share({
          title: 'Vila da Lua',
          text,
          url: window.location.href,
        });
      else {
        await navigator.clipboard.writeText(
          `${text} — ${window.location.href}`,
        );
        setShareMessage('Convite copiado.');
      }
    } catch {
      setShareMessage(
        'Não foi possível compartilhar. Diga o código em voz alta.',
      );
    }
  };

  return (
    <main className="app-shell" id="main-content">
      <header className="topbar">
        <div>
          <span className="brand-mark" aria-hidden="true">
            ◐
          </span>
          <span className="brand-name">Vila da Lua</span>
        </div>
        <ConnectionBadge state={network} />
      </header>

      <section className="room-banner" aria-labelledby="lobby-title">
        <p className="eyebrow">Código da sala</p>
        <button
          className="room-code"
          type="button"
          onClick={() => void share()}
          aria-label={`Compartilhar sala ${publicState.roomCode}`}
        >
          {publicState.roomCode}
          <span>Compartilhar</span>
        </button>
        <p className="sr-status" role="status" aria-live="polite">
          {shareMessage}
        </p>
        <h1 id="lobby-title">A vila se reúne</h1>
        <p>{publicState.players.length} de 20 lugares ocupados</p>
      </section>

      <div className="lobby-grid">
        <section
          className="panel participant-panel"
          aria-labelledby="participants-title"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">Ao redor da fogueira</p>
              <h2 id="participants-title">Participantes</h2>
            </div>
            <span className="count-medallion">
              {publicState.players.length}
            </span>
          </div>
          <ul className="participant-list">
            {publicState.players.map((player) => (
              <li key={player.id}>
                {player.id === privateState.playerId ? (
                  <AvatarPicker
                    avatarId={player.avatarId}
                    nickname={player.nickname}
                    className="participant-avatar"
                    disabled={props.busy || network !== 'connected'}
                    onSelect={props.onAvatarChange}
                  />
                ) : (
                  <ParticipantAvatar
                    avatarId={player.avatarId}
                    className="participant-avatar"
                  />
                )}
                <span className="participant-name">
                  {player.nickname}
                  {player.host ? <small>Anfitrião</small> : null}
                </span>
                <span className={`readiness ${player.ready ? 'is-ready' : ''}`}>
                  {player.connection === 'disconnected'
                    ? 'Ausente'
                    : player.ready
                      ? 'Pronto'
                      : 'Preparando'}
                </span>
                {host?.canConfigure &&
                !player.host &&
                player.id !== privateState.playerId ? (
                  <button
                    className="icon-button remove-player"
                    type="button"
                    aria-label={`Remover ${player.nickname}`}
                    disabled={props.busy || network !== 'connected'}
                    onClick={() => void props.onRemove(player.id)}
                  >
                    ×
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          <button
            className={self?.ready ? 'secondary-button' : 'primary-button'}
            type="button"
            disabled={props.busy || network !== 'connected'}
            onClick={() => void props.onReady(!self?.ready)}
          >
            {self?.ready ? 'Ainda não estou pronto' : 'Estou pronto'}
          </button>
        </section>

        {host?.canConfigure ? (
          <SettingsPanel
            snapshot={snapshot}
            connected={network === 'connected'}
            onSave={props.onSettings}
          />
        ) : (
          <SettingsSummary
            settings={publicState.settings}
            playerCount={publicState.players.length}
          />
        )}
      </div>

      <section className="start-dock" aria-label="Início da partida">
        <p className="form-message" role="status" aria-live="polite">
          {props.message}
        </p>
        {host ? (
          <>
            {host.startBlockers.length > 0 ? (
              <ul className="blocker-list" aria-label="Pendências para iniciar">
                {host.startBlockers.map((blocker) => (
                  <li key={blocker}>
                    {startBlockerLabels[blocker] ?? blocker}
                  </li>
                ))}
              </ul>
            ) : null}
            <button
              className="primary-button"
              type="button"
              disabled={!host.canStart || props.busy || network !== 'connected'}
              onClick={() => void props.onStart()}
            >
              Começar a crônica
            </button>
          </>
        ) : (
          <p>A partida começa quando o anfitrião tocar o sino.</p>
        )}
        <div className="quiet-actions">
          <button
            type="button"
            className="text-button"
            onClick={props.onInstall}
          >
            Instalar aplicativo
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => void props.onLeave()}
          >
            Sair da sala
          </button>
        </div>
      </section>
    </main>
  );
}

type SettingsPanelProps = {
  snapshot: GameSnapshot;
  connected: boolean;
  onSave: (settings: RoomSettings) => Promise<void>;
};

function SettingsPanel({ snapshot, connected, onSave }: SettingsPanelProps) {
  const [minutes, setMinutes] = useState(
    snapshot.public.settings.discussionMinutes,
  );
  const [allowNoExile, setAllowNoExile] = useState(
    snapshot.public.settings.allowNoExile,
  );
  const [roles, setRoles] = useState<RoleId[]>(
    snapshot.host?.configuredSpecialRoles ??
      snapshot.public.settings.specialRoles,
  );
  const [hideSpecialRoles, setHideSpecialRoles] = useState(
    snapshot.public.settings.hideSpecialRoles,
  );
  const [showFinalTimeline, setShowFinalTimeline] = useState(
    snapshot.public.settings.showFinalTimeline,
  );
  const saveQueue = useRef(Promise.resolve());
  const playerCount = snapshot.public.players.length;
  const compositionPlayerCount = Math.max(6, playerCount);
  const wolves = werewolfCount(compositionPlayerCount);
  const maxSpecials = compositionPlayerCount - wolves - 1;
  const compositionError =
    roles.length > maxSpecials
      ? `Remova ${roles.length - maxSpecials} papel especial para manter ao menos um Aldeão.`
      : null;

  const persist = (settings: RoomSettings) => {
    const save = () => onSave(settings);
    saveQueue.current = saveQueue.current.then(save, save);
  };

  const toggleRole = (role: RoleId) => {
    const next = roles.includes(role)
      ? roles.filter((item) => item !== role)
      : [...roles, role];
    setRoles(next);
    persist({
      discussionMinutes: minutes,
      allowNoExile,
      hideSpecialRoles,
      showFinalTimeline,
      specialRoles: next,
    });
  };

  const suggestRoles = (hidden: boolean) => {
    const next = balancedRoleSuggestion(compositionPlayerCount);
    setRoles(next);
    setHideSpecialRoles(hidden);
    persist({
      discussionMinutes: minutes,
      allowNoExile,
      hideSpecialRoles: hidden,
      showFinalTimeline,
      specialRoles: next,
    });
  };

  return (
    <section className="panel settings-panel" aria-labelledby="settings-title">
      <div className="settings-panel__controls">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Regras da noite</p>
            <h2 id="settings-title">Configuração</h2>
          </div>
          <span className="wolf-count">
            {wolves} {wolves === 1 ? 'Lobisomem' : 'Lobisomens'}
          </span>
        </div>

        <label>
          Discussão diurna
          <select
            value={minutes}
            disabled={!connected}
            onChange={(event) => {
              const next = Number(event.target.value);
              setMinutes(next);
              persist({
                discussionMinutes: next,
                allowNoExile,
                hideSpecialRoles,
                showFinalTimeline,
                specialRoles: roles,
              });
            }}
          >
            {[1, 2, 3, 4, 5, 7, 10, 12, 15].map((value) => (
              <option key={value} value={value}>
                {value} {value === 1 ? 'minuto' : 'minutos'}
              </option>
            ))}
          </select>
        </label>

        <label className="switch-row">
          <span>
            Permitir “não expulsar”
            <small>A vila pode encerrar o dia sem eliminação.</small>
          </span>
          <input
            type="checkbox"
            checked={allowNoExile}
            disabled={!connected}
            onChange={(event) => {
              const next = event.target.checked;
              setAllowNoExile(next);
              persist({
                discussionMinutes: minutes,
                allowNoExile: next,
                hideSpecialRoles,
                showFinalTimeline,
                specialRoles: roles,
              });
            }}
          />
        </label>

        <label className="switch-row">
          <span>
            Exibir linha do tempo decisiva
            <small>
              Ao final, mostra as ações e acontecimentos que definiram a
              partida.
            </small>
          </span>
          <input
            type="checkbox"
            checked={showFinalTimeline}
            disabled={!connected}
            onChange={(event) => {
              const next = event.target.checked;
              setShowFinalTimeline(next);
              persist({
                discussionMinutes: minutes,
                allowNoExile,
                hideSpecialRoles,
                showFinalTimeline: next,
                specialRoles: roles,
              });
            }}
          />
        </label>

        <fieldset className="role-picker">
          <legend>Papéis especiais</legend>
          <div className="role-picker-intro">
            <p>Escolha até {maxSpecials}. Aldeões completam as vagas.</p>
            <div className="role-picker-actions">
              <button
                className="role-suggestion-button"
                type="button"
                disabled={!connected || maxSpecials === 0}
                onClick={() => suggestRoles(false)}
              >
                Sugerir papéis aleatórios
              </button>
              <button
                className="role-suggestion-button"
                type="button"
                aria-pressed={hideSpecialRoles}
                disabled={!connected || maxSpecials === 0}
                onClick={() => suggestRoles(true)}
              >
                Modo Oculto
              </button>
            </div>
          </div>
          {hideSpecialRoles ? (
            <p className="hidden-roles-status">
              Modo oculto ativo. Uma composição equilibrada foi salva sem
              revelar os papéis.
            </p>
          ) : (
            <div className="role-grid">
              {specialRoleIds.map((roleId) => {
                const role = roleCatalog[roleId];
                return (
                  <label
                    className={
                      roles.includes(roleId)
                        ? 'role-option is-selected'
                        : 'role-option'
                    }
                    key={roleId}
                  >
                    <input
                      type="checkbox"
                      checked={roles.includes(roleId)}
                      disabled={
                        !connected ||
                        (!roles.includes(roleId) && roles.length >= maxSpecials)
                      }
                      onChange={() => toggleRole(roleId)}
                    />
                    <span className="role-option__mark" aria-hidden="true">
                      {role.mark}
                    </span>
                    <span>
                      {role.name}
                      <small>{role.short}</small>
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>

        <RoleReference />

        <p className="form-message" role="alert">
          {compositionError}
        </p>
        <p className="settings-autosave-note" role="status">
          Alterações são salvas automaticamente.
        </p>
      </div>
    </section>
  );
}

function SettingsSummary({
  settings,
  playerCount,
}: {
  settings: RoomSettings;
  playerCount: number;
}) {
  return (
    <section className="panel settings-summary" aria-labelledby="rules-title">
      <p className="eyebrow">Definido pelo anfitrião</p>
      <h2 id="rules-title">Regras da partida</h2>
      <dl>
        <div>
          <dt>Discussão</dt>
          <dd>{settings.discussionMinutes} min</dd>
        </div>
        <div>
          <dt>Lobisomens</dt>
          <dd>{werewolfCount(playerCount)}</dd>
        </div>
        <div>
          <dt>A vila pode encerrar o dia sem eliminação:</dt>
          <dd>{settings.allowNoExile ? 'Sim' : 'Não'}</dd>
        </div>
        <div>
          <dt>Especiais</dt>
          <dd>
            {settings.hideSpecialRoles
              ? 'Ocultos'
              : settings.specialRoles.length}
          </dd>
        </div>
        <div>
          <dt>Exibir linha do tempo decisiva:</dt>
          <dd>{settings.showFinalTimeline ? 'Sim' : 'Não'}</dd>
        </div>
      </dl>
      <div className="selected-roles" aria-label="Papéis selecionados">
        <h3>Papéis selecionados</h3>
        {settings.hideSpecialRoles ? (
          <p>O anfitrião manteve a composição em segredo.</p>
        ) : settings.specialRoles.length > 0 ? (
          <ul>
            {settings.specialRoles.map((role) => (
              <li key={role}>
                <span aria-hidden="true">{roleCatalog[role].mark}</span>
                {roleCatalog[role].name}
              </li>
            ))}
          </ul>
        ) : (
          <p>Nenhum papel especial selecionado.</p>
        )}
      </div>
      <RoleReference />
    </section>
  );
}

function RoleReference() {
  return (
    <details className="role-catalog role-reference">
      <summary>Consultar regras dos 11 papéis</summary>
      <div>
        {(
          Object.entries(roleCatalog) as Array<
            [RoleId, (typeof roleCatalog)[RoleId]]
          >
        ).map(([id, role]) => (
          <article key={id}>
            <h3>{role.name}</h3>
            <p>{role.short}</p>
            <p>
              <strong>Objetivo:</strong> {role.objective}
            </p>
            <p>
              <strong>Alvos:</strong> {role.targeting}
            </p>
            <ul>
              {role.rules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </article>
        ))}
        <article>
          <h3>Prioridade da resolução</h3>
          <ol>
            {gameRuleCatalog.resolutionPriority.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ol>
        </article>
        <article>
          <h3>Vitórias especiais</h3>
          <ul>
            {gameRuleCatalog.specialVictories.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </article>
      </div>
    </details>
  );
}
