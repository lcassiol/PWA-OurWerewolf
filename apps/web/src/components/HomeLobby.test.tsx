import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { RoomSettings } from '@our-werewolf/shared';
import { HomeScreen } from './HomeScreen';
import { LobbyScreen } from './LobbyScreen';
import { makeSnapshot } from '../test/fixtures';
import { cityForRoom, roomCities } from '../room-city';

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
    const onAvatarChange = vi.fn().mockResolvedValue(undefined);
    const onSettings = vi.fn().mockResolvedValue(undefined);
    const snapshot = makeSnapshot();
    snapshot.public.settings.allowNoExile = false;
    snapshot.host = {
      ...snapshot.host!,
      startBlockers: [
        'player-count',
        'players-not-ready',
        'invalid-composition',
      ],
    };
    render(
      <LobbyScreen
        snapshot={snapshot}
        network="connected"
        busy={false}
        message={null}
        onReady={onReady}
        onAvatarChange={onAvatarChange}
        onSettings={onSettings}
        onStart={vi.fn()}
        onRemove={vi.fn()}
        onLeave={vi.fn()}
        onInstall={vi.fn()}
      />,
    );

    const city = cityForRoom(snapshot.public.roomCode);
    expect(roomCities).toContain(city);
    expect(
      screen.getByRole('heading', {
        name: `A vila se reúne em ${city} durante a...`,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Compartilhar sala LUAR' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('6/20 conectados')).toHaveLength(2);
    expect(
      screen.getByRole('img', {
        name: 'Lobisomem do tema Lenda de Outono',
      }),
    ).toBeInTheDocument();
    const blockers = within(screen.getByLabelText('Pendências para iniciar'));
    expect(
      blockers.getByText('São necessários de 6 a 20 jogadores.'),
    ).toBeInTheDocument();
    expect(
      blockers.getByText('Todos os jogadores precisam estar prontos.'),
    ).toBeInTheDocument();
    expect(
      blockers.queryByText('A composição de papéis é inválida.'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Começar a crônica' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Remover Bento' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Iara').closest('li')).toHaveClass(
      'is-current-user',
    );
    expect(screen.getByText('Bento').closest('li')).not.toHaveClass(
      'is-current-user',
    );
    expect(
      screen.queryByLabelText(/Permitir “não expulsar”/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByLabelText(/Exibir linha do tempo decisiva/),
    ).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Estou pronto' }));
    expect(onReady).toHaveBeenCalledWith(true);

    await user.click(
      screen.getByRole('button', { name: 'Escolher avatar de Iara' }),
    );
    expect(
      within(screen.getByRole('dialog')).getAllByRole('button', {
        pressed: false,
      }),
    ).toHaveLength(9);
    await user.click(screen.getByRole('button', { name: 'Raposa' }));
    expect(onAvatarChange).toHaveBeenCalledWith('fox');

    await user.selectOptions(screen.getByLabelText('Discussão diurna'), '7');
    await user.click(screen.getByLabelText(/Vidente/));
    await waitFor(() =>
      expect(onSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({ discussionMinutes: 7, specialRoles: [] }),
      ),
    );
    await user.click(screen.getByLabelText(/Exibir linha do tempo decisiva/));
    await waitFor(() =>
      expect(onSettings).toHaveBeenLastCalledWith(
        expect.objectContaining({ showFinalTimeline: false }),
      ),
    );
    expect(
      screen.queryByRole('button', { name: 'Salvar configuração' }),
    ).not.toBeInTheDocument();
  });

  it('sugere uma composição aleatória válida de papéis especiais', async () => {
    const user = userEvent.setup();
    const onSettings = vi
      .fn<(settings: RoomSettings) => Promise<void>>()
      .mockResolvedValue(undefined);
    render(
      <LobbyScreen
        snapshot={makeSnapshot()}
        network="connected"
        busy={false}
        message={null}
        onReady={vi.fn()}
        onAvatarChange={vi.fn()}
        onSettings={onSettings}
        onStart={vi.fn()}
        onRemove={vi.fn()}
        onLeave={vi.fn()}
        onInstall={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Sugerir papéis aleatórios' }),
    );
    expect(
      within(screen.getByRole('group', { name: 'Papéis especiais' }))
        .getAllByRole('checkbox')
        .filter((checkbox) => (checkbox as HTMLInputElement).checked),
    ).toHaveLength(2);
    await waitFor(() => expect(onSettings).toHaveBeenCalledOnce());
  });

  it('sorteia uma composição equilibrada sem revelar os papéis no modo oculto', async () => {
    const user = userEvent.setup();
    const onSettings = vi
      .fn<(settings: RoomSettings) => Promise<void>>()
      .mockResolvedValue(undefined);
    render(
      <LobbyScreen
        snapshot={makeSnapshot()}
        network="connected"
        busy={false}
        message={null}
        onReady={vi.fn()}
        onAvatarChange={vi.fn()}
        onSettings={onSettings}
        onStart={vi.fn()}
        onRemove={vi.fn()}
        onLeave={vi.fn()}
        onInstall={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Modo Oculto' }));

    expect(screen.queryByLabelText(/Vidente/)).not.toBeInTheDocument();
    expect(screen.getByText(/Modo oculto ativo/)).toBeInTheDocument();
    await waitFor(() => {
      const settings = onSettings.mock.calls[0]?.[0];
      expect(settings).toEqual(
        expect.objectContaining({ hideSpecialRoles: true }),
      );
      expect(settings?.specialRoles).toHaveLength(2);
    });
  });

  it('não oferece configuração nem remoção a um participante comum', () => {
    const snapshot = makeSnapshot({
      host: null,
      private: { ...makeSnapshot().private, playerId: 'p2' },
    });
    const props = {
      network: 'connected' as const,
      busy: false,
      message: null,
      onReady: vi.fn(),
      onAvatarChange: vi.fn(),
      onSettings: vi.fn(),
      onStart: vi.fn(),
      onRemove: vi.fn(),
      onLeave: vi.fn(),
      onInstall: vi.fn(),
    };
    const { rerender } = render(<LobbyScreen snapshot={snapshot} {...props} />);

    expect(
      screen.getByRole('heading', { name: 'Regras da partida' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Remover/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('A vila pode encerrar o dia sem eliminação:'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Sim')).toBeInTheDocument();
    expect(
      within(screen.getByLabelText('Papéis selecionados')).getByText('Vidente'),
    ).toBeVisible();
    expect(
      screen.queryByText('Ver papéis selecionados'),
    ).not.toBeInTheDocument();

    rerender(
      <LobbyScreen
        snapshot={makeSnapshot({
          host: null,
          private: { ...makeSnapshot().private, playerId: 'p2' },
          public: {
            ...makeSnapshot().public,
            settings: {
              ...makeSnapshot().public.settings,
              allowNoExile: false,
              hideSpecialRoles: true,
              specialRoles: [],
            },
          },
        })}
        {...props}
      />,
    );
    expect(
      screen.getByText('O anfitrião manteve a composição em segredo.'),
    ).toBeVisible();
    expect(
      within(screen.getByLabelText('Papéis selecionados')).queryByText(
        'Vidente',
      ),
    ).not.toBeInTheDocument();
  });

  it('preserva edições locais quando presença ou prontidão atualiza a versão', async () => {
    const user = userEvent.setup();
    const props = {
      network: 'connected' as const,
      busy: false,
      message: null,
      onReady: vi.fn(),
      onAvatarChange: vi.fn(),
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
