import { describe, expect, it } from 'vitest';
import {
  DomainRuleError,
  assignRoles,
  buildRoleComposition,
  castWolfVote,
  createLoverBond,
  dayVoteWeight,
  earnsFoolVictory,
  getWerewolfCount,
  initialWitchResources,
  inspectAlignment,
  knownLivingWerewolves,
  resolveDeathChain,
  resolveLittleGirlSpy,
  resolveWitchAction,
  resolveWolfVotes,
  roleCatalog,
  shuffle,
  validateDoctorTarget,
  validateGuardianTarget,
  type DomainPlayer,
  type RandomSource,
} from './roles.js';

function player(
  id: string,
  role: DomainPlayer['role'],
  alive = true,
): DomainPlayer {
  return { id, role, alive };
}

function sequenceRandom(...values: number[]): RandomSource {
  let index = 0;
  return () => values[index++] ?? 0;
}

describe('role composition and assignment', () => {
  it.each([
    [6, 1],
    [8, 1],
    [9, 2],
    [12, 2],
    [13, 3],
    [16, 3],
    [17, 4],
    [20, 4],
  ])('uses the required wolf band for %i players', (count, wolves) => {
    expect(getWerewolfCount(count)).toBe(wolves);
  });

  it('rejects player counts outside 6 through 20', () => {
    expect(() => getWerewolfCount(5)).toThrowError(DomainRuleError);
    expect(() => getWerewolfCount(21)).toThrowError('between 6 and 20');
    expect(() => getWerewolfCount(6.5)).toThrowError('between 6 and 20');
  });

  it('adds unique specials and fills every remaining slot with villagers', () => {
    const composition = buildRoleComposition(10, ['seer', 'witch', 'mayor']);
    expect(composition).toHaveLength(10);
    expect(composition.filter((role) => role === 'werewolf')).toHaveLength(2);
    expect(composition.filter((role) => role === 'villager')).toHaveLength(5);
    expect(composition).toEqual(
      expect.arrayContaining(['seer', 'witch', 'mayor']),
    );
  });

  it('rejects duplicate, fixed, and excessive special roles', () => {
    expect(() => buildRoleComposition(6, ['seer', 'seer'])).toThrowError(
      'only appear once',
    );
    expect(() => buildRoleComposition(6, ['werewolf'])).toThrowError(
      'not a configurable',
    );
    expect(() =>
      buildRoleComposition(6, ['seer', 'witch', 'doctor', 'hunter', 'mayor']),
    ).toThrowError('leave room for a villager');
  });

  it('catalogs all eleven roles with help and tested alignment metadata', () => {
    expect(Object.keys(roleCatalog)).toEqual([
      'werewolf',
      'villager',
      'hunter',
      'seer',
      'witch',
      'doctor',
      'fool',
      'cupid',
      'guardian',
      'mayor',
      'little-girl',
    ]);
    for (const definition of Object.values(roleCatalog)) {
      expect(definition.summary.length).toBeGreaterThan(20);
      expect(definition.objective.length).toBeGreaterThan(10);
    }
    expect(roleCatalog.fool.alignment).toBe('neutral');
  });

  it('shuffles and assigns exactly once with reproducible injected randomness', () => {
    const composition = buildRoleComposition(6, ['seer']);
    const first = assignRoles(
      ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'],
      composition,
      sequenceRandom(0.1, 0.9, 0.3, 0.7, 0.5),
    );
    const second = assignRoles(
      ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'],
      composition,
      sequenceRandom(0.1, 0.9, 0.3, 0.7, 0.5),
    );
    expect(first).toEqual(second);
    expect(new Set(first.map(({ playerId }) => playerId))).toHaveLength(6);
    expect(first.map(({ role }) => role).sort()).toEqual(
      [...composition].sort(),
    );
    expect(() => assignRoles(['p1'], composition, () => 0)).toThrowError(
      'same length',
    );
    expect(() =>
      assignRoles(['p1', 'p1'], ['seer', 'villager'], () => 0),
    ).toThrowError('only one role');
    expect(() => shuffle([1, 2], () => 1)).toThrowError('in [0, 1)');
  });
});

describe('werewolf, seer, and mayor policies', () => {
  const players = [
    player('w1', 'werewolf'),
    player('w2', 'werewolf'),
    player('seer', 'seer'),
    player('fool', 'fool'),
    player('mayor', 'mayor'),
  ];

  it('selects only a unique pack leader and treats ties or no votes as no attack', () => {
    expect(
      resolveWolfVotes(
        [
          { voterId: 'w1', targetId: 'seer' },
          { voterId: 'w2', targetId: 'seer' },
        ],
        players,
      ),
    ).toMatchObject({ targetId: 'seer', tied: false, tally: { seer: 2 } });
    expect(
      resolveWolfVotes(
        [
          { voterId: 'w1', targetId: 'seer' },
          { voterId: 'w2', targetId: 'fool' },
        ],
        players,
      ),
    ).toMatchObject({ targetId: null, tied: true });
    expect(resolveWolfVotes([], players)).toMatchObject({
      targetId: null,
      tied: false,
    });
  });

  it('replaces a wolf vote and rejects invalid voters and pack targets', () => {
    const first = castWolfVote(
      [],
      { voterId: 'w1', targetId: 'seer' },
      players,
    );
    expect(
      castWolfVote(first, { voterId: 'w1', targetId: 'fool' }, players),
    ).toEqual([{ voterId: 'w1', targetId: 'fool' }]);
    expect(() =>
      castWolfVote([], { voterId: 'seer', targetId: 'fool' }, players),
    ).toThrowError('living werewolf');
    expect(() =>
      castWolfVote([], { voterId: 'w1', targetId: 'w2' }, players),
    ).toThrowError('non-werewolf');
  });

  it('reveals only the other living members of the pack to a werewolf', () => {
    expect(
      knownLivingWerewolves('w1', [
        ...players,
        player('dead-wolf', 'werewolf', false),
      ]),
    ).toEqual(['w2']);
    expect(() => knownLivingWerewolves('seer', players)).toThrowError(
      'living werewolf',
    );
  });

  it('reveals alignment rather than exact role and applies a secret mayor weight', () => {
    expect(inspectAlignment('seer', 'w1', players)).toBe('werewolves');
    expect(inspectAlignment('seer', 'fool', players)).toBe('neutral');
    expect(inspectAlignment('seer', 'mayor', players)).toBe('village');
    expect(dayVoteWeight(player('mayor', 'mayor'))).toBe(2);
    expect(dayVoteWeight(player('mayor', 'mayor', false))).toBe(0);
    expect(dayVoteWeight(player('villager', 'villager'))).toBe(1);
  });
});

describe('witch, doctor, and guardian policies', () => {
  const players = [
    player('witch', 'witch'),
    player('doctor', 'doctor'),
    player('guardian', 'guardian'),
    player('target', 'villager'),
  ];

  it('consumes each witch potion once and permits only one action in a night', () => {
    const healed = resolveWitchAction(
      initialWitchResources,
      { kind: 'heal' },
      {
        witchId: 'witch',
        wolfTargetId: 'target',
        players,
        alreadyActed: false,
      },
    );
    expect(healed).toMatchObject({
      resources: { healingPotion: false, poisonPotion: true },
      healedTargetId: 'target',
    });
    expect(() =>
      resolveWitchAction(
        healed.resources,
        { kind: 'heal' },
        {
          witchId: 'witch',
          wolfTargetId: 'target',
          players,
          alreadyActed: false,
        },
      ),
    ).toThrowError('no longer available');
    expect(() =>
      resolveWitchAction(
        initialWitchResources,
        { kind: 'poison', targetId: 'target' },
        {
          witchId: 'witch',
          wolfTargetId: 'target',
          players,
          alreadyActed: true,
        },
      ),
    ).toThrowError('at most one potion');
  });

  it('allows doctor self-protection but rejects consecutive targets', () => {
    expect(() =>
      validateDoctorTarget('doctor', 'doctor', null, players),
    ).not.toThrow();
    expect(() =>
      validateDoctorTarget('doctor', 'target', 'target', players),
    ).toThrowError('consecutive nights');
  });

  it('requires the guardian to guard another living player', () => {
    expect(() =>
      validateGuardianTarget('guardian', 'target', players),
    ).not.toThrow();
    expect(() =>
      validateGuardianTarget('guardian', 'guardian', players),
    ).toThrowError('another living player');
  });
});

describe('cupid, hunter, fool, and little girl policies', () => {
  it('allows Cupid to be a lover and resolves hunter and lover cascades once', () => {
    const players = [
      player('cupid', 'cupid'),
      player('hunter', 'hunter'),
      player('lover', 'villager'),
      player('target', 'werewolf'),
    ];
    expect(createLoverBond('cupid', 'cupid', 'hunter', players)).toEqual({
      firstId: 'cupid',
      secondId: 'hunter',
    });
    const chain = resolveDeathChain(
      players,
      [{ playerId: 'hunter', cause: 'poison', causedById: null }],
      { firstId: 'hunter', secondId: 'lover' },
      { hunter: 'target' },
    );
    expect(chain.deaths.map(({ playerId }) => playerId)).toEqual([
      'hunter',
      'target',
      'lover',
    ]);
    expect(chain.survivors).toEqual(['cupid']);
  });

  it('stops lover cycles and validates hunter targets against current survivors', () => {
    const players = [player('hunter', 'hunter'), player('lover', 'villager')];
    const chain = resolveDeathChain(
      players,
      [{ playerId: 'hunter', cause: 'wolf-attack', causedById: null }],
      { firstId: 'hunter', secondId: 'lover' },
      { hunter: null },
    );
    expect(chain.deaths).toHaveLength(2);
    expect(() =>
      resolveDeathChain(
        players,
        [{ playerId: 'hunter', cause: 'wolf-attack', causedById: null }],
        null,
        { hunter: 'hunter' },
      ),
    ).toThrowError('living player');
  });

  it('awards the fool only for a day exile', () => {
    expect(earnsFoolVictory('fool', 'exile')).toBe(true);
    expect(earnsFoolVictory('fool', 'poison')).toBe(false);
    expect(earnsFoolVictory('villager', 'exile')).toBe(false);
  });

  it('records both little-girl random facts and the two detection outcomes', () => {
    const players = [
      player('girl', 'little-girl'),
      player('w1', 'werewolf'),
      player('w2', 'werewolf'),
    ];
    expect(
      resolveLittleGirlSpy('girl', players, sequenceRandom(0.75, 0.24)),
    ).toEqual({
      littleGirlId: 'girl',
      revealedWerewolfId: 'w2',
      detected: true,
      revealedToWerewolfIds: ['w1', 'w2'],
      randomFact: { wolfIndex: 1, detectionRoll: 0.24 },
    });
    expect(
      resolveLittleGirlSpy('girl', players, sequenceRandom(0, 0.25)),
    ).toMatchObject({
      revealedWerewolfId: 'w1',
      detected: false,
      revealedToWerewolfIds: [],
    });
  });
});
