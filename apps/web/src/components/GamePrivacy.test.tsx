import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { avatarIds, type GameCommand } from '@our-werewolf/shared';
import { GameScreen } from './GameScreen';
import { ParticipantAvatar } from './ParticipantAvatar';
import { SecretRoleCard } from './SecretRoleCard';
import { makeSnapshot } from '../test/fixtures';
import { roleArtwork } from '../role-artwork';

describe('avatares dos participantes', () => {
  it('renderiza os dez modelos disponíveis', () => {
    const { container } = render(
      <>
        {avatarIds.map((avatarId) => (
          <ParticipantAvatar avatarId={avatarId} key={avatarId} />
        ))}
      </>,
    );

    expect(container.querySelectorAll('[data-avatar-id]')).toHaveLength(10);
    expect(container.querySelectorAll('svg')).toHaveLength(10);
  });
});

describe('carta secreta', () => {
  const privateState = {
    ...makeSnapshot().private,
    role: 'seer' as const,
    alignment: 'village' as const,
    objective: 'Encontre a alcateia.',
  };

  it('exige revelação deliberada, permite ocultar e recobre ao perder visibilidade', async () => {
    const user = userEvent.setup();
    render(
      <SecretRoleCard
        privateState={privateState}
        players={makeSnapshot().public.players}
        canReveal
      />,
    );

    expect(screen.queryByText('Vidente')).not.toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Revelar minha carta' }),
    );
    expect(
      screen.getByRole('heading', { name: 'Vidente' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'Ilustração do papel Vidente' }),
    ).toHaveAttribute('src');
    expect(
      screen.getByRole('heading', { name: 'O que fazer' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Você não pode investigar a si mesma/),
    ).toBeInTheDocument();

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    fireEvent(document, new Event('visibilitychange'));
    expect(screen.queryByText('Vidente')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('img', { name: 'Ilustração do papel Vidente' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Revelar minha carta' }),
    ).toBeInTheDocument();
  });

  it('recobre imediatamente ao perder autorização de rede', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <SecretRoleCard
        privateState={privateState}
        players={makeSnapshot().public.players}
        canReveal
      />,
    );
    await user.click(
      screen.getByRole('button', { name: 'Revelar minha carta' }),
    );
    expect(screen.getByText(/Identifique o alinhamento/)).toBeInTheDocument();

    rerender(
      <SecretRoleCard
        privateState={privateState}
        players={makeSnapshot().public.players}
        canReveal={false}
      />,
    );
    expect(
      screen.queryByText(/Identifique o alinhamento/),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Aguardando conexão segura' }),
    ).toBeDisabled();
  });

  it('usa somente a coleção de ilustrações sorteada para a partida', async () => {
    const user = userEvent.setup();
    render(
      <SecretRoleCard
        privateState={privateState}
        players={makeSnapshot().public.players}
        artworkSetId="cartoon"
        canReveal
      />,
    );
    await user.click(
      screen.getByRole('button', { name: 'Revelar minha carta' }),
    );
    expect(
      screen.getByRole('img', { name: 'Ilustração do papel Vidente' }),
    ).toHaveAttribute('src', roleArtwork.cartoon.seer);
    expect(roleArtwork.cartoon.seer).not.toBe(roleArtwork.realistic.seer);
  });

  it('traduz o conhecimento privado e mostra o apelido público', async () => {
    const user = userEvent.setup();
    render(
      <SecretRoleCard
        privateState={{
          ...privateState,
          knownPlayers: [
            { playerId: 'p2', fact: 'werewolves' },
            { playerId: 'p3', fact: 'lover' },
          ],
        }}
        players={makeSnapshot().public.players}
        canReveal
      />,
    );
    await user.click(
      screen.getByRole('button', { name: 'Revelar minha carta' }),
    );

    expect(screen.getByText('Bento')).toBeInTheDocument();
    expect(screen.getByText('Cora')).toBeInTheDocument();
    expect(screen.getByText('Alinhamento: Lobisomens.')).toBeInTheDocument();
    expect(screen.getByText('É seu amor.')).toBeInTheDocument();
    expect(screen.queryByText('werewolves')).not.toBeInTheDocument();
  });
});

describe('fases e decisões', () => {
  const votingSnapshot = makeSnapshot({
    public: {
      ...makeSnapshot().public,
      status: 'playing',
      phase: 'voting',
      round: 2,
      deadline: new Date(Date.now() + 60_000).toISOString(),
    },
    private: {
      ...makeSnapshot().private,
      role: 'villager',
      alignment: 'village',
      objective: 'Encontre os Lobisomens.',
      availableAction: {
        type: 'day-vote',
        targets: ['p2', 'p3'],
        minTargets: 1,
        maxTargets: 1,
        allowAbstain: true,
      },
    },
    host: null,
  });

  it('aguarda o OK de todos no resumo do dia, inclusive de eliminados', async () => {
    const user = userEvent.setup();
    const onAcknowledge = vi.fn().mockResolvedValue(undefined);
    const dayResolution = makeSnapshot({
      public: {
        ...makeSnapshot().public,
        status: 'playing',
        phase: 'day-resolution',
        round: 1,
        deadline: null,
        players: makeSnapshot().public.players.map((player) =>
          player.id === 'p1' ? { ...player, alive: false } : player,
        ),
        dayResolutionAcknowledgement: {
          acknowledgedCount: 0,
          requiredCount: 6,
        },
        announcements: ['Ninguém foi expulso.'],
      },
    });
    const props = {
      network: 'connected' as const,
      privateFresh: true,
      busy: false,
      message: null,
      onCommand: vi.fn(),
      onReadyForVote: vi.fn(),
      onAcknowledgeDayResolution: onAcknowledge,
      onAvatarChange: vi.fn(),
      onReturn: vi.fn(),
      onInstall: vi.fn(),
    };
    const { rerender } = render(
      <GameScreen snapshot={dayResolution} {...props} />,
    );

    expect(screen.getByText('0 de 6 confirmaram')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'OK, continuar' }));
    expect(onAcknowledge).toHaveBeenCalledOnce();

    rerender(
      <GameScreen
        snapshot={makeSnapshot({
          ...dayResolution,
          public: {
            ...dayResolution.public,
            dayResolutionAcknowledgement: {
              acknowledgedCount: 1,
              requiredCount: 6,
            },
          },
          private: {
            ...dayResolution.private,
            acknowledgedDayResolution: true,
          },
        })}
        {...props}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'OK confirmado' }),
    ).toBeDisabled();
  });

  it('explica que o voto da alcateia escolhe quem os Lobisomens matarão', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn().mockResolvedValue(true);
    render(
      <GameScreen
        snapshot={makeSnapshot({
          public: {
            ...makeSnapshot().public,
            status: 'playing',
            phase: 'first-night',
            round: 1,
          },
          private: {
            ...makeSnapshot().private,
            role: 'werewolf',
            alignment: 'werewolves',
            knownPlayers: [
              { playerId: 'p4', fact: 'werewolf' },
              {
                playerId: 'p2',
                fact: 'pack-target',
                sourcePlayerId: 'p4',
              },
            ],
            availableAction: {
              type: 'wolf-vote',
              targets: ['p2', 'p3'],
              minTargets: 1,
              maxTargets: 1,
              allowAbstain: true,
            },
          },
        })}
        network="connected"
        privateFresh
        busy={false}
        message={null}
        onCommand={onCommand}
        onReadyForVote={vi.fn()}
        onAcknowledgeDayResolution={vi.fn()}
        onAvatarChange={vi.fn()}
        onReturn={vi.fn()}
        onInstall={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('heading', {
        name: 'Quem os Lobisomens devem matar?',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/A alcateia acompanha seus votos/),
    ).toHaveTextContent(/um dos alvos empatados será sorteado/);
    expect(screen.getByLabelText('Voto de Davi')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Bento').closest('.target-option'),
    ).toContainElement(screen.getByLabelText('Voto de Davi'));
    expect(
      screen.getByLabelText('Cora').closest('.target-option'),
    ).not.toContainElement(screen.getByLabelText('Voto de Davi'));
    await user.click(screen.getByLabelText('Bento'));
    await user.click(
      screen.getByRole('button', { name: 'Confirmar meu voto' }),
    );
    expect(onCommand).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'wolf-vote', targets: ['p2'] }),
    );
  });

  it('permite declarar prontidão durante a discussão e mostra a maioria', async () => {
    const user = userEvent.setup();
    const onReadyForVote = vi.fn().mockResolvedValue(undefined);
    render(
      <GameScreen
        snapshot={makeSnapshot({
          public: {
            ...makeSnapshot().public,
            status: 'playing',
            phase: 'discussion',
            round: 1,
            deadline: new Date(Date.now() + 60_000).toISOString(),
            discussionReadiness: { readyCount: 2, requiredCount: 4 },
          },
          private: {
            ...makeSnapshot().private,
            role: 'villager',
            alignment: 'village',
            readyForVote: false,
          },
          host: null,
        })}
        network="connected"
        privateFresh
        busy={false}
        message={null}
        onCommand={vi.fn()}
        onReadyForVote={onReadyForVote}
        onAcknowledgeDayResolution={vi.fn()}
        onAvatarChange={vi.fn()}
        onReturn={vi.fn()}
        onInstall={vi.fn()}
      />,
    );

    expect(screen.getByText('2 de 4 prontos para votar')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Estou pronto para votar' }),
    );
    expect(onReadyForVote).toHaveBeenCalledOnce();
  });

  it('envia voto com versão e fase autoritativas', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn().mockResolvedValue(true);
    render(
      <GameScreen
        snapshot={votingSnapshot}
        network="connected"
        privateFresh
        busy={false}
        message={null}
        onCommand={onCommand}
        onReadyForVote={vi.fn()}
        onAcknowledgeDayResolution={vi.fn()}
        onAvatarChange={vi.fn()}
        onReturn={vi.fn()}
        onInstall={vi.fn()}
      />,
    );

    expect(screen.getByRole('timer')).toHaveAccessibleName(/Tempo restante/);
    await user.click(screen.getByLabelText('Bento'));
    const submit = screen.getByRole('button', { name: 'Confirmar voto' });
    await user.click(submit);
    expect(submit).toHaveClass('is-confirmed');
    expect(onCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedVersion: 3,
        expectedPhase: 'voting',
        action: 'day-vote',
        targets: ['p2'],
      }),
    );
    await user.click(screen.getByLabelText('Cora'));
    expect(submit).not.toHaveClass('is-confirmed');
  });

  it('bloqueia comandos enquanto estiver offline', () => {
    render(
      <GameScreen
        snapshot={votingSnapshot}
        network="offline"
        privateFresh={false}
        busy={false}
        message={null}
        onCommand={vi.fn()}
        onReadyForVote={vi.fn()}
        onAcknowledgeDayResolution={vi.fn()}
        onAvatarChange={vi.fn()}
        onReturn={vi.fn()}
        onInstall={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('heading', {
        name: 'Atualizando sua visão privada',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Não expulsar')).not.toBeInTheDocument();
    expect(
      screen
        .getAllByRole('status')
        .some((status) => status.textContent?.includes('Offline')),
    ).toBe(true);
    expect(screen.getByText(/Nenhuma ação será enviada/)).toBeInTheDocument();
  });

  it('permite abstenção individual na votação', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn().mockResolvedValue(undefined);
    render(
      <GameScreen
        snapshot={votingSnapshot}
        network="connected"
        privateFresh
        busy={false}
        message={null}
        onCommand={onCommand}
        onReadyForVote={vi.fn()}
        onAcknowledgeDayResolution={vi.fn()}
        onAvatarChange={vi.fn()}
        onReturn={vi.fn()}
        onInstall={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText('Não expulsar')).not.toBeInTheDocument();
    await user.click(screen.getByLabelText('Abster-se desta ação'));
    await user.click(
      screen.getByRole('button', { name: 'Confirmar abstenção' }),
    );
    expect(onCommand).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'day-vote', targets: [] }),
    );
  });

  it('permite escolher entre as duas poções da Bruxa', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn().mockResolvedValue(undefined);
    const witchSnapshot = makeSnapshot({
      public: {
        ...makeSnapshot().public,
        status: 'playing',
        phase: 'night',
      },
      private: {
        ...makeSnapshot().private,
        role: 'witch',
        availableAction: {
          type: 'witch-heal',
          targets: ['p2'],
          minTargets: 1,
          maxTargets: 1,
          allowAbstain: true,
          alternatives: [
            {
              type: 'witch-poison',
              targets: ['p3'],
              minTargets: 1,
              maxTargets: 1,
              allowAbstain: true,
            },
          ],
        },
      },
    });
    render(
      <GameScreen
        snapshot={witchSnapshot}
        network="connected"
        privateFresh
        busy={false}
        message={null}
        onCommand={onCommand}
        onReadyForVote={vi.fn()}
        onAcknowledgeDayResolution={vi.fn()}
        onAvatarChange={vi.fn()}
        onReturn={vi.fn()}
        onInstall={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Poção de veneno' }));
    await user.click(screen.getByLabelText('Cora'));
    await user.click(
      screen.getByRole('button', { name: 'Usar poção de veneno' }),
    );
    expect(onCommand).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'witch-poison', targets: ['p3'] }),
    );
  });

  it('exige e envia abstenção explícita', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn().mockResolvedValue(true);
    const abstentionSnapshot = makeSnapshot({
      public: {
        ...votingSnapshot.public,
        phase: 'night',
      },
      private: {
        ...makeSnapshot().private,
        role: 'doctor',
        availableAction: {
          type: 'doctor-protect',
          targets: ['p1', 'p2'],
          minTargets: 1,
          maxTargets: 1,
          allowAbstain: true,
        },
      },
    });
    render(
      <GameScreen
        snapshot={abstentionSnapshot}
        network="connected"
        privateFresh
        busy={false}
        message={null}
        onCommand={onCommand}
        onReadyForVote={vi.fn()}
        onAcknowledgeDayResolution={vi.fn()}
        onAvatarChange={vi.fn()}
        onReturn={vi.fn()}
        onInstall={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Confirmar proteção' }),
    ).toBeDisabled();
    await user.click(screen.getByLabelText('Abster-se desta ação'));
    await user.click(
      screen.getByRole('button', { name: 'Confirmar abstenção' }),
    );
    expect(onCommand).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'doctor-protect', targets: [] }),
    );
  });

  it('preserva o commandId em uma tentativa não confirmada', async () => {
    const user = userEvent.setup();
    const onCommand = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    render(
      <GameScreen
        snapshot={votingSnapshot}
        network="connected"
        privateFresh
        busy={false}
        message={null}
        onCommand={onCommand}
        onReadyForVote={vi.fn()}
        onAcknowledgeDayResolution={vi.fn()}
        onAvatarChange={vi.fn()}
        onReturn={vi.fn()}
        onInstall={vi.fn()}
      />,
    );

    await user.click(screen.getByLabelText('Bento'));
    const submit = screen.getByRole('button', { name: 'Confirmar voto' });
    await user.click(submit);
    await user.click(submit);

    expect(onCommand).toHaveBeenCalledTimes(2);
    const firstCommand = onCommand.mock.calls[0]?.[0] as GameCommand;
    const retryCommand = onCommand.mock.calls[1]?.[0] as GameCommand;
    expect(firstCommand.commandId).toBe(retryCommand.commandId);
  });

  it('troca o commandId quando a pessoa muda a intenção', async () => {
    const user = userEvent.setup();
    const onCommand = vi.fn().mockResolvedValue(false);
    render(
      <GameScreen
        snapshot={votingSnapshot}
        network="connected"
        privateFresh
        busy={false}
        message={null}
        onCommand={onCommand}
        onReadyForVote={vi.fn()}
        onAcknowledgeDayResolution={vi.fn()}
        onAvatarChange={vi.fn()}
        onReturn={vi.fn()}
        onInstall={vi.fn()}
      />,
    );

    await user.click(screen.getByLabelText('Bento'));
    await user.click(screen.getByRole('button', { name: 'Confirmar voto' }));
    await user.click(screen.getByLabelText('Cora'));
    await user.click(screen.getByRole('button', { name: 'Confirmar voto' }));

    const firstCommand = onCommand.mock.calls[0]?.[0] as GameCommand;
    const changedCommand = onCommand.mock.calls[1]?.[0] as GameCommand;
    expect(firstCommand.commandId).not.toBe(changedCommand.commandId);
  });

  it('revela o resultado e permite voltar para a vila', async () => {
    const user = userEvent.setup();
    const onReturn = vi.fn().mockResolvedValue(undefined);
    const finalSnapshot = makeSnapshot({
      public: {
        ...makeSnapshot().public,
        status: 'finished',
        phase: 'finished',
        winner: 'village',
      },
      private: {
        ...makeSnapshot().private,
        role: 'fool',
        personalWinner: true,
      },
      host: null,
      finalRoles: [
        { playerId: 'p1', nickname: 'Iara', role: 'fool', winner: true },
        { playerId: 'p2', nickname: 'Bento', role: 'werewolf', winner: false },
      ],
      finalEvents: [
        {
          sequence: 1,
          type: 'elimination',
          data: {
            participantId: 'p2',
            cause: 'exile',
            causedById: null,
          },
        },
      ],
    });
    render(
      <GameScreen
        snapshot={finalSnapshot}
        network="connected"
        privateFresh
        busy={false}
        message={null}
        onCommand={vi.fn()}
        onReadyForVote={vi.fn()}
        onAcknowledgeDayResolution={vi.fn()}
        onAvatarChange={vi.fn()}
        onReturn={onReturn}
        onInstall={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'A Cidade venceu' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/vitória pessoal/)).toBeInTheDocument();
    expect(screen.getByText('Lobisomem')).toBeInTheDocument();
    expect(screen.getByText('Linha do tempo decisiva')).toBeInTheDocument();
    expect(
      screen.getByText('Bento foi expulso pela votação da vila.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Eliminação')).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'Voltar para sala ou início' }),
    );
    expect(onReturn).toHaveBeenCalledOnce();
  });
});
