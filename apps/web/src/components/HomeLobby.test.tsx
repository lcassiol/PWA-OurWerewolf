import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HomeScreen } from './HomeScreen';
import { LobbyScreen } from './LobbyScreen';
import { makeSnapshot } from '../test/fixtures';

describe('entrada na Vila da Lua', () => {
  it('cria uma sala por um formulário rotulado', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(
      <HomeScreen
        busy={false}
        error={null}
        online
        onCreate={onCreate}
        onJoin={vi.fn()}
        onInstall={vi.fn()}
      />,
    );

    await user.type(screen.getByLabelText('Seu apelido'), 'Iara');
    await user.click(screen.getByRole('button', { name: 'Criar minha vila' }));

    expect(onCreate).toHaveBeenCalledWith('Iara');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
  });

  it('normaliza o código ao entrar e mantém a ação indisponível offline', async () => {
    const user = userEvent.setup();
    const onJoin = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <HomeScreen
        busy={false}
        error={null}
        online
        onCreate={vi.fn()}
        onJoin={onJoin}
        onInstall={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Entrar com código' }));
    await user.type(screen.getByLabelText('Código da sala'), 'luar');
    await user.type(screen.getByLabelText('Seu apelido'), 'Bento');
    await user.click(screen.getByRole('button', { name: 'Entrar na vila' }));
    expect(onJoin).toHaveBeenCalledWith('LUAR', 'Bento');

    rerender(
      <HomeScreen
        busy={false}
        error={null}
        online={false}
        onCreate={vi.fn()}
        onJoin={onJoin}
        onInstall={vi.fn()}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Entrar na vila' }),
    ).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('online');
  });
});

describe('lobby', () => {
  it('mostra código, prontidão, pendências e controles exclusivos do anfitrião', async () => {
    const user = userEvent.setup();
    const onReady = vi.fn().mockResolvedValue(undefined);
    const onSettings = vi.fn().mockResolvedValue(undefined);
    render(
      <LobbyScreen
        snapshot={makeSnapshot()}
        network="connected"
        busy={false}
        message={null}
        onReady={onReady}
        onSettings={onSettings}
        onStart={vi.fn()}
        onRemove={vi.fn()}
        onLeave={vi.fn()}
        onInstall={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Compartilhar sala LUAR' }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByLabelText('Pendências para iniciar')).getByText(
        /Iara/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Começar a crônica' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Remover Bento' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Estou pronto' }));
    expect(onReady).toHaveBeenCalledWith(true);

    await user.selectOptions(screen.getByLabelText('Discussão diurna'), '7');
    await user.click(screen.getByLabelText(/Vidente/));
    await user.click(
      screen.getByRole('button', { name: 'Salvar configuração' }),
    );
    expect(onSettings).toHaveBeenCalledWith(
      expect.objectContaining({ discussionMinutes: 7, specialRoles: [] }),
    );
  });

  it('não oferece configuração nem remoção a um participante comum', () => {
    const snapshot = makeSnapshot({
      host: null,
      private: { ...makeSnapshot().private, playerId: 'p2' },
    });
    render(
      <LobbyScreen
        snapshot={snapshot}
        network="connected"
        busy={false}
        message={null}
        onReady={vi.fn()}
        onSettings={vi.fn()}
        onStart={vi.fn()}
        onRemove={vi.fn()}
        onLeave={vi.fn()}
        onInstall={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'Regras da partida' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Remover/ }),
    ).not.toBeInTheDocument();
  });

  it('preserva edições locais quando presença ou prontidão atualiza a versão', async () => {
    const user = userEvent.setup();
    const props = {
      network: 'connected' as const,
      busy: false,
      message: null,
      onReady: vi.fn(),
      onSettings: vi.fn(),
      onStart: vi.fn(),
      onRemove: vi.fn(),
      onLeave: vi.fn(),
      onInstall: vi.fn(),
    };
    const { rerender } = render(
      <LobbyScreen snapshot={makeSnapshot()} {...props} />,
    );
    await user.selectOptions(screen.getByLabelText('Discussão diurna'), '10');

    const updated = makeSnapshot({
      public: {
        ...makeSnapshot().public,
        version: 4,
        players: makeSnapshot().public.players.map((player) => ({
          ...player,
          ready: true,
        })),
      },
    });
    rerender(<LobbyScreen snapshot={updated} {...props} />);
    expect(screen.getByLabelText('Discussão diurna')).toHaveValue('10');
  });
});
