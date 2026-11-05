import type { GameSnapshot, ServerEvent } from '@our-werewolf/shared';
import { useEffect, useEffectEvent, useState } from 'react';
import type { ApiClient } from './api';
import { isSessionInvalid } from './snapshots';

export type NetworkState = 'connected' | 'reconnecting' | 'offline';

export function useCountdown(deadline: string | null): number | null {
  const [seconds, setSeconds] = useState<number | null>(() =>
    calculateRemaining(deadline),
  );

  useEffect(() => {
    const update = () => setSeconds(calculateRemaining(deadline));
    queueMicrotask(update);
    const timer = window.setInterval(update, 1000);
    document.addEventListener('visibilitychange', update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, [deadline]);

  return seconds;
}

type RealtimeOptions = {
  snapshot: GameSnapshot | null;
  apiClient: ApiClient;
  onSnapshot: (snapshot: GameSnapshot) => void;
  onMessage: (message: string) => void;
  onSessionInvalid: () => void;
};

export function useRealtime({
  snapshot,
  apiClient,
  onSnapshot,
  onMessage,
  onSessionInvalid,
}: RealtimeOptions) {
  const [network, setNetwork] = useState<NetworkState>(
    navigator.onLine ? 'reconnecting' : 'offline',
  );
  const [freshRoomCode, setFreshRoomCode] = useState<string | null>(null);
  const roomCode = snapshot?.public.roomCode;
  const invalidateSession = useEffectEvent(onSessionInvalid);

  const refresh = useEffectEvent(async () => {
    if (
      !snapshot ||
      !navigator.onLine ||
      document.visibilityState !== 'visible'
    ) {
      setFreshRoomCode(null);
      return false;
    }
    try {
      onSnapshot(await apiClient.getSnapshot(snapshot.public.roomCode));
      if (
        navigator.onLine &&
        document.visibilityState === 'visible' &&
        document.hasFocus()
      ) {
        setFreshRoomCode(snapshot.public.roomCode);
        return true;
      }
    } catch (error) {
      setFreshRoomCode(null);
      if (isSessionInvalid(error)) {
        invalidateSession();
        return false;
      }
      setNetwork(navigator.onLine ? 'reconnecting' : 'offline');
    }
    return false;
  });

  const receiveEvent = useEffectEvent((event: MessageEvent<string>) => {
    try {
      const payload = JSON.parse(event.data) as ServerEvent;
      if (payload.type === 'snapshot') onSnapshot(payload.snapshot);
      if (payload.type === 'error') {
        onMessage(payload.error.message);
        if (
          payload.error.code === 'stale_command' ||
          payload.error.code === 'phase_closed'
        ) {
          void refresh();
        }
      }
    } catch {
      onMessage(
        'A vila recebeu uma mensagem incompreensível. Atualizando o estado...',
      );
      void refresh();
    }
  });

  useEffect(() => {
    if (!roomCode) return;

    let socket: WebSocket | undefined;
    let retryTimer: number | undefined;
    let retry = 0;
    let stopped = false;

    const connect = () => {
      if (stopped || !navigator.onLine) {
        setFreshRoomCode(null);
        setNetwork('offline');
        return;
      }
      setFreshRoomCode(null);
      setNetwork('reconnecting');
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${window.location.host}/ws?room=${encodeURIComponent(roomCode)}`;
      socket = new WebSocket(url);
      socket.addEventListener('open', () => {
        retry = 0;
        void refresh().then((fresh) => {
          if (!stopped && fresh) setNetwork('connected');
        });
      });
      socket.addEventListener('message', receiveEvent);
      socket.addEventListener('close', (event) => {
        if (stopped) return;
        setFreshRoomCode(null);
        if (event.code === 4001) {
          stopped = true;
          setNetwork('offline');
          invalidateSession();
          return;
        }
        setNetwork(navigator.onLine ? 'reconnecting' : 'offline');
        const delay = Math.min(1000 * 2 ** retry, 15_000);
        retry += 1;
        retryTimer = window.setTimeout(connect, delay);
      });
      socket.addEventListener('error', () => socket?.close());
    };

    const online = () => {
      setFreshRoomCode(null);
      setNetwork('reconnecting');
      window.clearTimeout(retryTimer);
      retry = 0;
      connect();
    };
    const offline = () => {
      setFreshRoomCode(null);
      setNetwork('offline');
      socket?.close();
    };
    const visible = () => {
      if (document.visibilityState !== 'visible') {
        setFreshRoomCode(null);
        return;
      }
      setNetwork('reconnecting');
      void refresh().then((fresh) => {
        if (!stopped && fresh) setNetwork('connected');
      });
    };
    const blurred = () => setFreshRoomCode(null);
    const focused = () => {
      if (!navigator.onLine) return;
      setNetwork('reconnecting');
      void refresh().then((fresh) => {
        if (!stopped && fresh) setNetwork('connected');
      });
    };

    connect();
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    window.addEventListener('blur', blurred);
    window.addEventListener('focus', focused);
    document.addEventListener('visibilitychange', visible);
    return () => {
      stopped = true;
      window.clearTimeout(retryTimer);
      socket?.close();
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      window.removeEventListener('blur', blurred);
      window.removeEventListener('focus', focused);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [roomCode]);

  return {
    network,
    privateFresh: Boolean(roomCode && freshRoomCode === roomCode),
  };
}

export function formatCountdown(totalSeconds: number | null): string {
  if (totalSeconds === null) return 'Sem prazo';
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function calculateRemaining(deadline: string | null): number | null {
  return deadline === null
    ? null
    : Math.max(
        0,
        Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000),
      );
}
