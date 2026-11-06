import type { GameSnapshot } from '@our-werewolf/shared';

export function makeSnapshot(
  overrides: Partial<GameSnapshot> = {},
): GameSnapshot {
  const snapshot: GameSnapshot = {
    public: {
      roomCode: 'LUAR',
      status: 'lobby',
      version: 3,
      round: 0,
      phase: 'lobby',
      deadline: null,
      players: [
        {
          id: 'p1',
          nickname: 'Iara',
          avatarId: 'moon',
          alive: true,
          ready: false,
          connection: 'connected',
          host: true,
        },
        {
          id: 'p2',
          nickname: 'Bento',
          avatarId: 'owl',
          alive: true,
          ready: true,
          connection: 'connected',
          host: false,
        },
        {
          id: 'p3',
          nickname: 'Cora',
          avatarId: 'fox',
          alive: true,
          ready: true,
          connection: 'connected',
          host: false,
        },
        {
          id: 'p4',
          nickname: 'Davi',
          avatarId: 'stag',
          alive: true,
          ready: true,
          connection: 'connected',
          host: false,
        },
        {
          id: 'p5',
          nickname: 'Eva',
          avatarId: 'raven',
          alive: true,
          ready: true,
          connection: 'connected',
          host: false,
        },
        {
          id: 'p6',
          nickname: 'Félix',
          avatarId: 'cat',
          alive: true,
          ready: true,
          connection: 'connected',
          host: false,
        },
      ],
      settings: {
        discussionMinutes: 5,
        allowNoExile: true,
        hideSpecialRoles: false,
        showFinalTimeline: true,
        specialRoles: ['seer'],
      },
      discussionReadiness: null,
      announcements: [],
      winner: null,
    },
    private: {
      playerId: 'p1',
      role: null,
      alignment: null,
      objective: null,
      knownPlayers: [],
      resources: {},
      availableAction: null,
      readyForVote: false,
      personalWinner: false,
    },
    host: {
      canConfigure: true,
      canStart: false,
      startBlockers: ['Iara ainda não está pronta.'],
      configuredSpecialRoles: ['seer'],
    },
  };

  return {
    ...snapshot,
    ...overrides,
    public: { ...snapshot.public, ...overrides.public },
    private: { ...snapshot.private, ...overrides.private },
  };
}
