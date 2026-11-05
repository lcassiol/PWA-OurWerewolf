import type {
  GameCommand,
  GameSnapshot,
  RoomSettings,
} from '@our-werewolf/shared';
import { useEffect, useState } from 'react';
import { api, ApiRequestError } from './api';
import type { ApiClient } from './api';
import { GameScreen } from './components/GameScreen';
import { HomeScreen } from './components/HomeScreen';
import {
  canActivateUpdate,
  InstallGuide,
  usePwaInstall,
} from './components/InstallGuide';
import { LobbyScreen } from './components/LobbyScreen';
import { useRealtime } from './hooks';
import {
  isSessionInvalid,
  recoverRejectedCommand,
  selectCurrentSnapshot,
} from './snapshots';

export function App({ apiClient = api }: { apiClient?: ApiClient }) {
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [retrySession, setRetrySession] = useState(0);
  const installState = usePwaInstall();

  const applySnapshot = (incoming: GameSnapshot) => {
    setSnapshot((current) => selectCurrentSnapshot(current, incoming));
  };

  const clearInvalidSession = () => {
    setSnapshot(null);
    setMessage('Sua sessão não é mais válida. Entre novamente na vila.');
  };

  useEffect(() => {
    let active = true;
    const restore = async () => {
      if (!navigator.onLine) {
        queueMicrotask(() => {
          if (active) setBooting(false);
        });
        return;
      }
      try {
        const restored = await apiClient.restoreSession();
        if (active) applySnapshot(restored);
      } catch (error) {
        if (active && isSessionInvalid(error)) {
          clearInvalidSession();
          return;
        }
        if (
          active &&
          error instanceof ApiRequestError &&
          !['unauthorized', 'not_found'].includes(error.code)
        ) {
          setMessage(error.message);
        }
      } finally {
        if (active) setBooting(false);
      }
    };

    void restore();
    const handleOnline = () => {
      setOnline(true);
      void restore();
    };
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      active = false;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [apiClient, retrySession]);

  const realtime = useRealtime({
    snapshot,
    apiClient,
    onSnapshot: applySnapshot,
    onMessage: setMessage,
    onSessionInvalid: clearInvalidSession,
  });

  const run = async (
    operation: () => Promise<GameSnapshot>,
    success?: string,
  ): Promise<void> => {
    setBusy(true);
    setMessage(null);
    try {
      applySnapshot(await operation());
      if (success) setMessage(success);
    } catch (error) {
      if (isSessionInvalid(error)) clearInvalidSession();
      setMessage(
        error instanceof Error
          ? error.message
          : 'A ação não foi confirmada. Tente novamente.',
      );
    } finally {
      setBusy(false);
    }
  };

  const sendCommand = async (command: GameCommand): Promise<boolean> => {
    if (!snapshot || realtime.network !== 'connected') return false;
    setBusy(true);
    setMessage(null);
    try {
      applySnapshot(
        await apiClient.sendCommand(snapshot.public.roomCode, command),
      );
      setMessage('Decisão recebida pelo servidor.');
      return true;
    } catch (error) {
      await recoverRejectedCommand(
        error,
        () => apiClient.getSnapshot(snapshot.public.roomCode),
        applySnapshot,
        clearInvalidSession,
      );
      setMessage(
        error instanceof Error
          ? error.message
          : 'A decisão não foi confirmada. Tente novamente.',
      );
      return false;
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    if (!snapshot) return;
    setBusy(true);
    try {
      await apiClient.leaveRoom(snapshot.public.roomCode);
      setSnapshot(null);
      setMessage(null);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Não foi possível sair da sala.',
      );
    } finally {
      setBusy(false);
    }
  };

  const roomCode = snapshot?.public.roomCode;
  const decisionPending =
    Boolean(snapshot?.private.availableAction) &&
    snapshot?.public.phase !== 'finished';
  const updateSafe = canActivateUpdate(decisionPending, busy);

  let content;
  if (booting) {
    content = <LoadingScreen />;
  } else if (!snapshot && !online) {
    content = (
      <OfflineScreen
        onRetry={() => setRetrySession((value) => value + 1)}
        onInstall={() => installState.setOpen(true)}
      />
    );
  } else if (!snapshot) {
    content = (
      <HomeScreen
        busy={busy}
        error={message}
        online={online}
        onCreate={(nickname) => run(() => apiClient.createRoom(nickname))}
        onJoin={(code, nickname) =>
          run(() => apiClient.joinRoom(code, nickname))
        }
        onInstall={() => installState.setOpen(true)}
      />
    );
  } else if (snapshot.public.status === 'lobby') {
    content = (
      <LobbyScreen
        snapshot={snapshot}
        network={realtime.network}
        busy={busy}
        message={message}
        onReady={(ready) =>
          run(
            () => apiClient.setReady(snapshot.public.roomCode, ready),
            ready ? 'Você está pronto.' : 'Prontidão removida.',
          )
        }
        onSettings={(settings: RoomSettings) =>
          run(
            () => apiClient.updateSettings(snapshot.public.roomCode, settings),
            'Configuração salva.',
          )
        }
        onStart={() => run(() => apiClient.startGame(snapshot.public.roomCode))}
        onRemove={(playerId) =>
          run(
            () => apiClient.removePlayer(snapshot.public.roomCode, playerId),
            'Participante removido.',
          )
        }
        onLeave={leave}
        onInstall={() => installState.setOpen(true)}
      />
    );
  } else {
    content = (
      <GameScreen
        snapshot={snapshot}
        network={realtime.network}
        privateFresh={realtime.privateFresh}
        busy={busy}
        message={message}
        onCommand={sendCommand}
        onInstall={() => installState.setOpen(true)}
      />
    );
  }

  return (
    <>
      <a className="skip-link" href="#main-content">
        Ir para o conteúdo
      </a>
      {content}
      {installState.updateWaiting ? (
        <aside className="update-toast" aria-live="polite">
          <div>
            <strong>Uma nova versão chegou.</strong>
            <span>
              {decisionPending
                ? ' Termine sua decisão antes de atualizar.'
                : ' Atualize quando for seguro.'}
            </span>
          </div>
          <button
            type="button"
            onClick={installState.activateUpdate}
            disabled={!updateSafe}
          >
            Atualizar
          </button>
        </aside>
      ) : null}
      <InstallGuide state={installState} />
      <div className="sr-status" aria-live="assertive">
        {snapshot
          ? `Fase atual: ${snapshot.public.phase}. Versão ${snapshot.public.version}.`
          : ''}
      </div>
      {roomCode ? (
        <span className="visually-hidden">Sala atual {roomCode}</span>
      ) : null}
    </>
  );
}

function LoadingScreen() {
  return (
    <main className="state-screen" id="main-content" aria-busy="true">
      <div className="moon-seal is-loading" aria-hidden="true">
        <span>V</span>
      </div>
      <p className="eyebrow">Consultando a lua</p>
      <h1>Vila da Lua</h1>
    </main>
  );
}

function OfflineScreen({
  onRetry,
  onInstall,
}: {
  onRetry: () => void;
  onInstall: () => void;
}) {
  return (
    <main className="state-screen offline-screen" id="main-content">
      <div className="broken-moon" aria-hidden="true">
        ◒
      </div>
      <p className="eyebrow">A estrada desapareceu</p>
      <h1>Você está offline</h1>
      <p>
        A estrutura da vila está aqui, mas salas, papéis e decisões só existem
        com conexão ao servidor.
      </p>
      <button className="primary-button" type="button" onClick={onRetry}>
        Tentar reconectar
      </button>
      <button className="text-button" type="button" onClick={onInstall}>
        Como instalar
      </button>
    </main>
  );
}
