import { describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from './api';
import {
  isSessionInvalid,
  recoverRejectedCommand,
  selectCurrentSnapshot,
} from './snapshots';
import { makeSnapshot } from './test/fixtures';

describe('ordenação de snapshots', () => {
  it('rejeita versões antigas da mesma geração', () => {
    const current = makeSnapshot({
      public: { ...makeSnapshot().public, version: 8 },
    });
    const stale = makeSnapshot({
      public: { ...makeSnapshot().public, version: 7 },
    });

    expect(selectCurrentSnapshot(current, stale)).toBe(current);
  });

  it('aceita a transição lobby para jogo mesmo quando a versão reinicia', () => {
    const lobby = makeSnapshot({
      public: { ...makeSnapshot().public, version: 12 },
    });
    const game = makeSnapshot({
      public: {
        ...makeSnapshot().public,
        status: 'playing',
        phase: 'first-night',
        version: 1,
      },
    });

    expect(selectCurrentSnapshot(lobby, game)).toBe(game);
    expect(selectCurrentSnapshot(game, lobby)).toBe(game);
  });
});

describe('recuperação de comandos recusados', () => {
  it('reconhece status HTTP de autorização mesmo sem código de API', () => {
    expect(
      isSessionInvalid(new ApiRequestError('Negado', 'unknown', 401)),
    ).toBe(true);
    expect(
      isSessionInvalid(new ApiRequestError('Negado', 'unknown', 403)),
    ).toBe(true);
  });

  it.each(['stale_command', 'phase_closed'])(
    'renova o snapshot após %s',
    async (code) => {
      const refreshed = makeSnapshot({
        public: { ...makeSnapshot().public, version: 9 },
      });
      const refresh = vi.fn().mockResolvedValue(refreshed);
      const apply = vi.fn();

      await recoverRejectedCommand(
        new ApiRequestError('Estado mudou', code),
        refresh,
        apply,
        vi.fn(),
      );

      expect(refresh).toHaveBeenCalledOnce();
      expect(apply).toHaveBeenCalledWith(refreshed);
    },
  );

  it('limpa a sessão quando a renovação perde autorização', async () => {
    const clearSession = vi.fn();
    await recoverRejectedCommand(
      new ApiRequestError('Estado mudou', 'stale_command'),
      vi
        .fn()
        .mockRejectedValue(new ApiRequestError('Sessão inválida', 'forbidden')),
      vi.fn(),
      clearSession,
    );

    expect(clearSession).toHaveBeenCalledOnce();
  });
});
