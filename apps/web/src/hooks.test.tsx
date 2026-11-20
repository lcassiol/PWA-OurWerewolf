import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from './api';
import { useCountdown, useRealtime } from './hooks';
import { makeSnapshot } from './test/fixtures';

class FakeWebSocket extends EventTarget {
  static latest: FakeWebSocket | null = null;

  constructor() {
    super();
    FakeWebSocket.latest = this;
  }

  close() {}
}

describe('realtime authorization', () => {
  it('clears the session when the server closes an invalid identity', () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const onSessionInvalid = vi.fn();
    const apiClient = {
      getSnapshot: vi.fn(),
    } as unknown as ApiClient;

    const { unmount } = renderHook(() =>
      useRealtime({
        snapshot: makeSnapshot(),
        apiClient,
        onSnapshot: vi.fn(),
        onMessage: vi.fn(),
        onSessionInvalid,
      }),
    );
    act(() => {
      FakeWebSocket.latest?.dispatchEvent(
        new CloseEvent('close', { code: 4001 }),
      );
    });
    expect(onSessionInvalid).toHaveBeenCalledOnce();
    unmount();
    vi.unstubAllGlobals();
  });

  it('restaura a visão privada ao voltar visível mesmo antes do foco móvel estabilizar', async () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    const snapshot = makeSnapshot();
    const apiClient = {
      getSnapshot: vi.fn().mockResolvedValue(snapshot),
    } as unknown as ApiClient;
    const onSnapshot = vi.fn();

    const { result, unmount } = renderHook(() =>
      useRealtime({
        snapshot,
        apiClient,
        onSnapshot,
        onMessage: vi.fn(),
        onSessionInvalid: vi.fn(),
      }),
    );
    await act(() => {
      FakeWebSocket.latest?.dispatchEvent(new Event('open'));
      return Promise.resolve();
    });

    await waitFor(() => expect(result.current.privateFresh).toBe(true));
    expect(result.current.network).toBe('connected');
    expect(onSnapshot).toHaveBeenCalledWith(snapshot);
    unmount();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});

describe('authoritative countdown', () => {
  it('recalculates from the server deadline after time and visibility changes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    const { result, unmount } = renderHook(() =>
      useCountdown('2026-01-01T00:01:00.000Z'),
    );
    expect(result.current).toBe(60);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(result.current).toBe(50);
    act(() => {
      vi.setSystemTime(new Date('2026-01-01T00:00:30.000Z'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(result.current).toBe(30);
    unmount();
    vi.useRealTimers();
  });
});
