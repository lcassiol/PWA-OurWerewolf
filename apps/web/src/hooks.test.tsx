import { act, renderHook } from '@testing-library/react';
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
