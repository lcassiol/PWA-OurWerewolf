import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api';
import { makeSnapshot } from './test/fixtures';

describe('cliente HTTP', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('inclui credenciais e não solicita cache ao renovar snapshots', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(makeSnapshot()), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await api.getSnapshot('LUAR');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/rooms/LUAR/snapshot',
      expect.objectContaining({
        credentials: 'include',
        cache: 'no-store',
      }),
    );
  });

  it('inclui credenciais também nos comandos mutáveis', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(makeSnapshot()), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await api.createRoom('Iara');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/rooms',
      expect.objectContaining({
        credentials: 'include',
        cache: 'no-store',
        method: 'POST',
        body: JSON.stringify({ nickname: 'Iara' }),
      }),
    );
  });

  it('nunca permite cache do navegador em respostas autenticadas', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify(makeSnapshot()), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await api.restoreSession();
    await api.sendCommand('LUAR', {
      commandId: 'command-1',
      expectedVersion: 3,
      expectedPhase: 'voting',
      action: 'day-vote',
      targets: ['p2'],
    });

    for (const [, init] of fetchMock.mock.calls) {
      expect(init).toEqual(expect.objectContaining({ cache: 'no-store' }));
    }
  });

  it('usa as rotas do servidor e remove o envelope de snapshot', async () => {
    const snapshot = makeSnapshot();
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ snapshot }), { status: 200 }),
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.joinRoom('LUAR', 'Iara')).resolves.toEqual(snapshot);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/rooms/LUAR/join',
      expect.objectContaining({ method: 'POST' }),
    );

    await api.setReady('LUAR', true);
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/rooms/LUAR/ready',
      expect.objectContaining({ method: 'PATCH' }),
    );

    await api.setAvatar('LUAR', 'fox');
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/rooms/LUAR/avatar',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ avatarId: 'fox' }),
      }),
    );

    await api.markReadyForVote('LUAR');
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/rooms/LUAR/vote-ready',
      expect.objectContaining({ method: 'POST' }),
    );

    await api.returnAfterGame('LUAR');
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/rooms/LUAR/return',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('retorna null quando o retorno pós-jogo leva à página inicial', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
    );

    await expect(api.returnAfterGame('LUAR')).resolves.toBeNull();
  });

  it('preserva o status de uma resposta de autorização sem JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('negado', { status: 401 })),
    );

    await expect(api.restoreSession()).rejects.toEqual(
      expect.objectContaining({ status: 401 }),
    );
  });
});
