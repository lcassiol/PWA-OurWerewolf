import type { GameSnapshot, RoleId, RoomSettings } from '@our-werewolf/shared';
import { useState } from 'react';
import type { FormEvent } from 'react';
import {
  gameRuleCatalog,
  roleCatalog,
  specialRoleIds,
  werewolfCount,
} from '../catalog';
import type { NetworkState } from '../hooks';
import { ConnectionBadge } from './ConnectionBadge';

type LobbyScreenProps = {
  snapshot: GameSnapshot;
  network: NetworkState;
  busy: boolean;
  message: string | null;
  onReady: (ready: boolean) => Promise<void>;
  onSettings: (settings: RoomSettings) => Promise<void>;
  onStart: () => Promise<void>;
  onRemove: (playerId: string) => Promise<void>;
  onLeave: () => Promise<void>;
  onInstall: () => void;
};

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
                <span className="participant-avatar" aria-hidden="true">
                  {player.nickname.slice(0, 1).toUpperCase()}
                </span>
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
            busy={props.busy}
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
                  <li key={blocker}>{blocker}</li>
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
  busy: boolean;
  connected: boolean;
  onSave: (settings: RoomSettings) => Promise<void>;
};

function SettingsPanel({
  snapshot,
  busy,
  connected,
  onSave,
}: SettingsPanelProps) {
  const [minutes, setMinutes] = useState(
    snapshot.public.settings.discussionMinutes,
  );
  const [allowNoExile, setAllowNoExile] = useState(
    snapshot.public.settings.allowNoExile,
  );
  const [roles, setRoles] = useState<RoleId[]>(
    snapshot.public.settings.specialRoles,
  );
  const playerCount = snapshot.public.players.length;
  const wolves = werewolfCount(playerCount);
  const maxSpecials = Math.max(0, playerCount - wolves - 1);
  const compositionError =
    playerCount < 6
      ? `Faltam ${6 - playerCount} pessoas para validar a composição.`
      : roles.length > maxSpecials
        ? `Remova ${roles.length - maxSpecials} papel especial para manter ao menos um Aldeão.`
        : null;

  const toggleRole = (role: RoleId) => {
    setRoles((current) =>
      current.includes(role)
        ? current.filter((item) => item !== role)
        : [...current, role],
    );
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!compositionError)
      await onSave({
        discussionMinutes: minutes,
        allowNoExile,
        specialRoles: roles,
      });
  };

  return (
    <section className="panel settings-panel" aria-labelledby="settings-title">
      <form onSubmit={(event) => void submit(event)}>
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
            onChange={(event) => setMinutes(Number(event.target.value))}
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
            onChange={(event) => setAllowNoExile(event.target.checked)}
          />
        </label>

        <fieldset className="role-picker">
          <legend>Papéis especiais</legend>
          <p>Escolha até {maxSpecials}. Aldeões completam as vagas.</p>
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
        </fieldset>

        <RoleReference />

        <p className="form-message" role="alert">
          {compositionError}
        </p>
        <button
          className="secondary-button"
          type="submit"
          disabled={busy || !connected || Boolean(compositionError)}
        >
          Salvar configuração
        </button>
      </form>
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
          <dt>Sem expulsão</dt>
          <dd>{settings.allowNoExile ? 'Permitido' : 'Não permitido'}</dd>
        </div>
        <div>
          <dt>Especiais</dt>
          <dd>{settings.specialRoles.length}</dd>
        </div>
      </dl>
      <details className="role-catalog">
        <summary>Ver papéis selecionados</summary>
        <ul>
          {settings.specialRoles.map((role) => (
            <li key={role}>{roleCatalog[role].name}</li>
          ))}
        </ul>
      </details>
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
