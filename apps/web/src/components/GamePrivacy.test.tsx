import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { GameCommand } from '@our-werewolf/shared';
import { GameScreen } from './GameScreen';
import { SecretRoleCard } from './SecretRoleCard';
import { makeSnapshot } from '../test/fixtures';

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

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    fireEvent(document, new Event('visibilitychange'));
    expect(screen.queryByText('Vidente')).not.toBeInTheDocument();
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
    expect(screen.getByText('Encontre a alcateia.')).toBeInTheDocument();

    rerender(
      <SecretRoleCard
        privateState={privateState}
        players={makeSnapshot().public.players}
        canReveal={false}
      />,
    );
    expect(screen.queryByText('Encontre a alcateia.')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Aguardando conexão segura' }),
    ).toBeDisabled();
  });

  it('mostra o apelido público junto de cada conhecimento privado', async () => {
    const user = userEvent.setup();
    render(
      <SecretRoleCard
        privateState={{
          ...privateState,
          knownPlayers: [
            { playerId: 'p2', fact: 'Pertence à alcateia.' },
            { playerId: 'p3', fact: 'É seu amor.' },
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
    expect(screen.getByText('Pertence à alcateia.')).toBeInTheDocument();
    expect(screen.getByText('É seu amor.')).toBeInTheDocument();
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
        allowAbstain: false,
      },
    },
    host: null,
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
        onInstall={vi.fn()}
      />,
    );

    expect(screen.getByRole('timer')).toHaveAccessibleName(/Tempo restante/);
    await user.click(screen.getByLabelText('Bento'));
    await user.click(screen.getByRole('button', { name: 'Confirmar voto' }));
    expect(onCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedVersion: 3,
        expectedPhase: 'voting',
        action: 'day-vote',
        targets: ['p2'],
      }),
    );
  });

  it('bloqueia comandos offline e oferece a opção sem expulsão', () => {
    render(
      <GameScreen
        snapshot={votingSnapshot}
        network="offline"
        privateFresh={false}
        busy={false}
        message={null}
        onCommand={vi.fn()}
        onReadyForVote={vi.fn()}
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

  it('envia a opção sem expulsão como alvo do voto', async () => {
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
        onInstall={vi.fn()}
      />,
    );

    await user.click(screen.getByLabelText('Não expulsar'));
    await user.click(
      screen.getByRole('button', { name: 'Confirmar sem expulsão' }),
    );
    expect(onCommand).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'day-vote', targets: ['no-exile'] }),
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

  it('revela vencedores principais, pessoais e todos os papéis no final', () => {
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
  });
});
