import { describe, expect, it } from 'vitest';
import {
  NO_EXILE,
  advancePhase,
  canAdvancePhase,
  castDayVote,
  completeDecision,
  createGameState,
  enterHunterShotPhase,
  evaluateVictory,
  rememberProcessedCommand,
  resolveDay,
  resolveDayVotes,
  resolveNight,
  validateCommand,
  type CommandContext,
  type NightResolutionInput,
} from './game.js';
import { initialWitchResources, type DomainPlayer } from './roles.js';

function player(
  id: string,
  role: DomainPlayer['role'],
  alive = true,
): DomainPlayer {
  return { id, role, alive };
}

describe('day voting and resolution', () => {
  const players = [
    player('mayor', 'mayor'),
    player('v1', 'villager'),
    player('v2', 'villager'),
    player('v3', 'villager'),
  ];

  it('counts the mayor as two without exposing anything beyond the tally', () => {
    expect(
      resolveDayVotes(
        [
          { voterId: 'mayor', targetId: 'v1' },
          { voterId: 'v2', targetId: 'v1' },
          { voterId: 'v3', targetId: 'v2' },
        ],
        players,
        false,
      ),
    ).toEqual({
      exiledPlayerId: 'v1',
      reason: 'exile',
      tally: { v1: 3, v2: 1 },
    });
  });

  it('replaces a voter choice and rejects dead voters and self votes', () => {
    const first = castDayVote(
      [],
      { voterId: 'v1', targetId: 'v2' },
      players,
      false,
    );
    expect(
      castDayVote(first, { voterId: 'v1', targetId: 'v3' }, players, false),
    ).toEqual([{ voterId: 'v1', targetId: 'v3' }]);
    expect(() =>
      castDayVote([], { voterId: 'v1', targetId: 'v1' }, players, false),
    ).toThrowError('another living player');
    expect(() =>
      castDayVote(
        [],
        { voterId: 'dead', targetId: 'v1' },
        [...players, player('dead', 'seer', false)],
        false,
      ),
    ).toThrowError('cannot vote');
  });

  it('prefers no-exile on an equal count and has no exile on a player tie', () => {
    expect(
      resolveDayVotes(
        [
          { voterId: 'mayor', targetId: 'v1' },
          { voterId: 'v2', targetId: NO_EXILE },
          { voterId: 'v3', targetId: NO_EXILE },
        ],
        players,
        true,
      ),
    ).toMatchObject({ exiledPlayerId: null, reason: 'no-exile' });
    expect(
      resolveDayVotes(
        [
          { voterId: 'v1', targetId: 'v2' },
          { voterId: 'v2', targetId: 'v1' },
        ],
        players,
        false,
      ),
    ).toMatchObject({ exiledPlayerId: null, reason: 'tie' });
    expect(() =>
      castDayVote([], { voterId: 'v1', targetId: NO_EXILE }, players, false),
    ).toThrowError('disabled');
  });

  it('records a fool exile as personal victory without ending an unresolved main contest', () => {
    const gamePlayers = [
      player('wolf', 'werewolf'),
      player('v1', 'villager'),
      player('v2', 'villager'),
      player('v3', 'villager'),
      player('fool', 'fool'),
    ];
    const result = resolveDay(
      gamePlayers,
      [
        { voterId: 'wolf', targetId: 'fool' },
        { voterId: 'v1', targetId: 'fool' },
        { voterId: 'v2', targetId: 'fool' },
      ],
      {
        allowNoExile: false,
        lovers: null,
        hunterShots: {},
        personalWinnerIds: [],
      },
    );
    expect(result.personalWinnerIds).toEqual(['fool']);
    expect(result.players.find(({ id }) => id === 'fool')?.alive).toBe(false);
    expect(result.victory).toBeNull();
  });

  it('finishes all death effects from an exile before checking victory', () => {
    const gamePlayers = [
      player('wolf', 'werewolf'),
      player('hunter', 'hunter'),
      player('lover', 'villager'),
      player('voter', 'villager'),
    ];
    const result = resolveDay(
      gamePlayers,
      [
        { voterId: 'wolf', targetId: 'hunter' },
        { voterId: 'lover', targetId: 'hunter' },
      ],
      {
        allowNoExile: false,
        lovers: { firstId: 'hunter', secondId: 'lover' },
        hunterShots: { hunter: 'wolf' },
        personalWinnerIds: [],
      },
    );
    expect(result.deaths.map(({ playerId }) => playerId)).toEqual([
      'hunter',
      'wolf',
      'lover',
    ]);
    expect(result.victory?.mainWinner).toBe('village');
  });
});

describe('ordered victory evaluation', () => {
  it('evaluates lovers before parity', () => {
    const players = [player('wolf', 'werewolf'), player('lover', 'villager')];
    expect(
      evaluateVictory(players, { firstId: 'wolf', secondId: 'lover' }),
    ).toMatchObject({
      mainWinner: 'lovers',
      winnerIds: ['wolf', 'lover'],
    });
  });

  it('awards village at zero wolves and werewolves at parity', () => {
    expect(
      evaluateVictory([player('seer', 'seer'), player('fool', 'fool')], null),
    ).toEqual({
      mainWinner: 'village',
      winnerIds: ['seer'],
      personalWinnerIds: [],
    });
    expect(
      evaluateVictory(
        [
          player('wolf', 'werewolf'),
          player('villager', 'villager'),
          player('dead-wolf', 'werewolf', false),
        ],
        null,
        ['fool'],
      ),
    ).toEqual({
      mainWinner: 'werewolves',
      winnerIds: ['wolf', 'dead-wolf', 'fool'],
      personalWinnerIds: ['fool'],
    });
  });

  it('does not let a personal winner end the main game', () => {
    expect(
      evaluateVictory(
        [
          player('wolf', 'werewolf'),
          player('v1', 'villager'),
          player('v2', 'villager'),
        ],
        null,
        ['fool'],
      ),
    ).toBeNull();
  });
});

function nightInput(players: readonly DomainPlayer[]): NightResolutionInput {
  return {
    players,
    wolfVotes: [],
    witchId: null,
    witchResources: initialWitchResources,
    witchAction: null,
    doctorId: null,
    doctorTargetId: null,
    previousDoctorTargetId: null,
    guardianId: null,
    guardianTargetId: null,
    lovers: null,
    hunterShots: {},
    personalWinnerIds: [],
  };
}

describe('night resolution pipeline', () => {
  const players = [
    player('wolf', 'werewolf'),
    player('witch', 'witch'),
    player('doctor', 'doctor'),
    player('guardian', 'guardian'),
    player('target', 'villager'),
    player('other', 'villager'),
  ];

  it('applies healing and doctor protection before guardian interception', () => {
    const result = resolveNight({
      ...nightInput(players),
      wolfVotes: [{ voterId: 'wolf', targetId: 'target' }],
      witchId: 'witch',
      witchAction: { kind: 'heal' },
      doctorId: 'doctor',
      doctorTargetId: 'target',
      guardianId: 'guardian',
      guardianTargetId: 'target',
    });
    expect(result.deaths).toEqual([]);
    expect(result.witchResources.healingPotion).toBe(false);
    expect(result.effects.map(({ type }) => type)).not.toContain(
      'guardian-intercept',
    );
  });

  it('kills the guardian instead when an unblocked pack attack is intercepted', () => {
    const result = resolveNight({
      ...nightInput(players),
      wolfVotes: [{ voterId: 'wolf', targetId: 'target' }],
      guardianId: 'guardian',
      guardianTargetId: 'target',
    });
    expect(result.deaths).toEqual([
      {
        playerId: 'guardian',
        cause: 'guardian-intercept',
        causedById: null,
      },
    ]);
    expect(result.players.find(({ id }) => id === 'target')?.alive).toBe(true);
  });

  it('does not let doctor protection stop poison and resolves derived deaths before victory', () => {
    const chainPlayers = [
      player('wolf', 'werewolf'),
      player('witch', 'witch'),
      player('doctor', 'doctor'),
      player('hunter', 'hunter'),
      player('lover', 'villager'),
      player('other', 'villager'),
    ];
    const result = resolveNight({
      ...nightInput(chainPlayers),
      witchId: 'witch',
      witchAction: { kind: 'poison', targetId: 'hunter' },
      doctorId: 'doctor',
      doctorTargetId: 'hunter',
      lovers: { firstId: 'hunter', secondId: 'lover' },
      hunterShots: { hunter: 'wolf' },
    });
    expect(result.deaths.map(({ playerId }) => playerId)).toEqual([
      'hunter',
      'wolf',
      'lover',
    ]);
    expect(result.victory?.mainWinner).toBe('village');
    expect(result.witchResources.poisonPotion).toBe(false);
  });

  it('records only one final death when pack attack and poison hit the same target', () => {
    const result = resolveNight({
      ...nightInput(players),
      wolfVotes: [{ voterId: 'wolf', targetId: 'target' }],
      witchId: 'witch',
      witchAction: { kind: 'poison', targetId: 'target' },
    });
    expect(result.deaths).toEqual([
      { playerId: 'target', cause: 'wolf-attack', causedById: null },
    ]);
  });
});

describe('game phase state machine', () => {
  it('advances early after all required decisions and follows the complete cycle', () => {
    let state = createGameState(1_000, ['cupid']);
    expect(canAdvancePhase(state, 100)).toBe(false);
    state = completeDecision(state, 'cupid');
    expect(canAdvancePhase(state, 100)).toBe(true);
    state = advancePhase(state, { nowMs: 100, deadlineMs: null });
    expect(state.phase).toBe('dawn');
    state = advancePhase(state, { nowMs: 100, deadlineMs: 500 });
    expect(state.phase).toBe('discussion');
    expect(() =>
      advancePhase(state, { nowMs: 499, deadlineMs: 800 }),
    ).toThrowError('still pending');
    state = advancePhase(state, {
      nowMs: 500,
      deadlineMs: 800,
      requiredDecisionPlayerIds: ['p1', 'p2'],
    });
    expect(state.phase).toBe('voting');
    state = completeDecision(state, 'p1');
    state = advancePhase(state, { nowMs: 800, deadlineMs: null });
    expect(state).toMatchObject({
      phase: 'day-resolution',
      lastAbstainedPlayerIds: ['p2'],
    });
    state = {
      ...state,
      requiredDecisionPlayerIds: ['p1', 'p2'],
    };
    state = completeDecision(state, 'p1');
    expect(canAdvancePhase(state, 800)).toBe(false);
    state = completeDecision(state, 'p2');
    state = advancePhase(state, { nowMs: 800, deadlineMs: 1_200 });
    expect(state).toMatchObject({ phase: 'night', round: 2, version: 6 });
  });

  it('opens and resumes a hunter decision without losing the round', () => {
    const dawn = advancePhase(createGameState(0), {
      nowMs: 0,
      deadlineMs: null,
    });
    const hunter = enterHunterShotPhase(dawn, 'hunter', 'dawn', 100);
    expect(hunter).toMatchObject({ phase: 'hunter-shot', resumePhase: 'dawn' });
    const resumed = advancePhase(completeDecision(hunter, 'hunter'), {
      nowMs: 50,
      deadlineMs: null,
    });
    expect(resumed).toMatchObject({
      phase: 'dawn',
      resumePhase: null,
      round: 1,
    });
  });

  it('makes a winning transition terminal', () => {
    const state = createGameState(0);
    const victory = evaluateVictory([player('villager', 'villager')], null);
    expect(victory).not.toBeNull();
    const finished = advancePhase(state, {
      nowMs: 0,
      deadlineMs: null,
      victory,
    });
    expect(finished).toMatchObject({
      phase: 'finished',
      deadlineMs: null,
      victory,
    });
    expect(() =>
      advancePhase(finished, { nowMs: 1, deadlineMs: null }),
    ).toThrowError('cannot advance');
  });
});

describe('command validation and idempotency', () => {
  const players = [
    player('wolf', 'werewolf'),
    player('villager', 'villager'),
    player('doctor', 'doctor'),
    player('hunter', 'hunter', false),
  ];
  const context: CommandContext = {
    version: 4,
    phase: 'night',
    players,
    processedCommandIds: [],
    allowNoExile: true,
    previousDoctorTargetId: 'villager',
    firstNightSetupComplete: true,
  };

  it('accepts an authorized current command and validates role targets', () => {
    expect(
      validateCommand(context, 'wolf', {
        commandId: 'c1',
        expectedVersion: 4,
        expectedPhase: 'night',
        action: 'wolf-vote',
        targets: ['villager'],
      }),
    ).toEqual({ accepted: true, duplicate: false });
    expect(
      validateCommand(context, 'doctor', {
        commandId: 'c2',
        expectedVersion: 4,
        expectedPhase: 'night',
        action: 'doctor-protect',
        targets: ['villager'],
      }),
    ).toMatchObject({ accepted: false, code: 'invalid-target' });
  });

  it('checks duplicate, version, phase, life, and authorization guards', () => {
    const base = {
      commandId: 'used',
      expectedVersion: 4,
      expectedPhase: 'night' as const,
      action: 'wolf-vote' as const,
      targets: ['villager'],
    };
    expect(
      validateCommand(
        { ...context, processedCommandIds: ['used'] },
        'wolf',
        base,
      ),
    ).toMatchObject({ duplicate: true, code: 'duplicate-command' });
    expect(
      validateCommand(context, 'wolf', {
        ...base,
        commandId: 'new',
        expectedVersion: 3,
      }),
    ).toMatchObject({ code: 'stale-version' });
    expect(
      validateCommand(context, 'wolf', {
        ...base,
        commandId: 'new',
        expectedPhase: 'voting',
      }),
    ).toMatchObject({ code: 'phase-closed' });
    expect(
      validateCommand(context, 'hunter', {
        ...base,
        commandId: 'new',
        action: 'day-vote',
      }),
    ).toMatchObject({ code: 'phase-closed' });
    expect(
      validateCommand(context, 'hunter', {
        ...base,
        commandId: 'new',
      }),
    ).toMatchObject({ code: 'dead-player' });
    expect(
      validateCommand(context, 'villager', { ...base, commandId: 'new' }),
    ).toMatchObject({
      code: 'action-not-allowed',
    });
  });

  it('holds ordinary night commands until first-night setup is complete', () => {
    expect(
      validateCommand(
        {
          ...context,
          phase: 'first-night',
          firstNightSetupComplete: false,
        },
        'wolf',
        {
          commandId: 'first-night-wolf',
          expectedVersion: 4,
          expectedPhase: 'first-night',
          action: 'wolf-vote',
          targets: ['villager'],
        },
      ),
    ).toMatchObject({ code: 'phase-closed' });
  });

  it('permits a dead hunter only in hunter-shot and stores command ids once', () => {
    expect(
      validateCommand({ ...context, phase: 'hunter-shot' }, 'hunter', {
        commandId: 'shot',
        expectedVersion: 4,
        expectedPhase: 'hunter-shot',
        action: 'hunter-shoot',
        targets: ['wolf'],
      }),
    ).toEqual({ accepted: true, duplicate: false });
    expect(
      rememberProcessedCommand(rememberProcessedCommand([], 'c1'), 'c1'),
    ).toEqual(['c1']);
  });
});
