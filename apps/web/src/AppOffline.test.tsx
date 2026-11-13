import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from './api';
import { ApiRequestError } from './api';
import { App } from './App';
import { makeSnapshot } from './test/fixtures';

function mockApi(): ApiClient {
  return {
    restoreSession: vi.fn().mockRejectedValue(new Error('Sem rede')),
    createRoom: vi.fn().mockResolvedValue(makeSnapshot()),
    joinRoom: vi.fn().mockResolvedValue(makeSnapshot()),
    getSnapshot: vi.fn().mockResolvedValue(makeSnapshot()),
    setReady: vi.fn().mockResolvedValue(makeSnapshot()),
    setAvatar: vi.fn().mockResolvedValue(makeSnapshot()),
    updateSettings: vi.fn().mockResolvedValue(makeSnapshot()),
    startGame: vi.fn().mockResolvedValue(makeSnapshot()),
    markReadyForVote: vi.fn().mockResolvedValue(makeSnapshot()),
    acknowledgeDayResolution: vi.fn().mockResolvedValue(makeSnapshot()),
    removePlayer: vi.fn().mockResolvedValue(makeSnapshot()),
    leaveRoom: vi.fn().mockResolvedValue(undefined),
    returnAfterGame: vi.fn().mockResolvedValue(makeSnapshot()),
    sendCommand: vi.fn().mockResolvedValue(makeSnapshot()),
  };
}

describe('abertura offline', () => {
  it.each(['unauthorized', 'forbidden'])(
    'abre a tela inicial sem avisar sobre sessão em uma primeira visita com %s',
    async (code) => {
      Object.defineProperty(navigator, 'onLine', {
        configurable: true,
        value: true,
      });
      const apiClient = mockApi();
      vi.mocked(apiClient.restoreSession).mockRejectedValue(
        new ApiRequestError('Sessão inválida', code),
      );

      render(<App apiClient={apiClient} />);

      expect(
        await screen.findByRole('button', { name: 'Criar minha vila' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(/sessão não é mais válida/i),
      ).not.toBeInTheDocument();
    },
  );

  it('não consulta nem exibe snapshot antigo como partida ativa', async () => {
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    const apiClient = mockApi();
    render(<App apiClient={apiClient} />);

    expect(
      await screen.findByRole('heading', { name: 'Você está offline' }),
    ).toBeInTheDocument();
    expect(apiClient.restoreSession).not.toHaveBeenCalled();
    expect(screen.queryByText('LUAR')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Tentar reconectar' }),
    ).toBeInTheDocument();
  });

  it('anuncia a fase atual em uma região viva após restaurar a sessão', async () => {
    const apiClient = mockApi();
    vi.mocked(apiClient.restoreSession).mockResolvedValue(
      makeSnapshot({
        public: { ...makeSnapshot().public, themeId: 'spirit-veil' },
      }),
    );
    render(<App apiClient={apiClient} />);

    await waitFor(() =>
      expect(screen.getByText(/Fase atual: lobby/)).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('heading', {
        name: /A vila se reúne em .+ durante o\.\.\. VÉU DOS ESPÍRITOS/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(document.documentElement).toHaveAttribute(
      'data-theme',
      'spirit-veil',
    );
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute(
      'content',
      '#151126',
    );
  });

  it.each(['unauthorized', 'forbidden'])(
    'limpa o estado restaurado após %s',
    async (code) => {
      const apiClient = mockApi();
      vi.mocked(apiClient.restoreSession)
        .mockResolvedValueOnce(makeSnapshot())
        .mockRejectedValueOnce(new ApiRequestError('Sessão inválida', code));
      render(<App apiClient={apiClient} />);
      expect(
        await screen.findByRole('heading', { name: /A vila se reúne em/ }),
      ).toBeInTheDocument();

      window.dispatchEvent(new Event('online'));

      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Criar minha vila' }),
        ).toBeInTheDocument(),
      );
      expect(screen.getByRole('alert')).toHaveTextContent(
        'sessão não é mais válida',
      );
    },
  );
});
