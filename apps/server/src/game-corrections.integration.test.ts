import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createDomainAdapter, type DomainAdapter } from './domain-adapter.js';
import type { GameActionType, GameSnapshot, RoleId } from './contracts.js';
import { migrateUp } from './db/migrate.js';
import {
  GameService,
  roleArtworkSetForGame,
  type Identity,
} from './game-service.js';
import { createLogger } from './logger.js';

type Member = { identity: Identity; credential: string };

void test('role artwork collection is stable and balanced from the random game id', () => {
  assert.equal(roleArtworkSetForGame('game-0'), 'cartoon');
  assert.equal(roleArtworkSetForGame('game-2'), 'cartoon');
  assert.equal(roleArtworkSetForGame('game-1'), 'realistic');
  assert.equal(roleArtworkSetForGame('game-f'), 'realistic');
});

function fixture(
  specialRoles: RoleId[],
  playerCount = 6,
  showFinalTimeline = true,
) {
  const database = new DatabaseSync(':memory:');
  migrateUp(database);
  const service = new GameService({
    database,
    domain: createDomainAdapter((maximum) => maximum - 1),
    logger: createLogger(() => undefined),
    sessionSecret: 'test-secret-that-is-at-least-32-characters',
    sessionTtlSeconds: 3_600,
  });
  const host = service.createRoom('Player 0');
  const members: Member[] = [host];
  for (let index = 1; index < playerCount; index += 1) {
    members.push(service.joinRoom(host.identity.roomCode, `Player ${index}`));
  }
  service.setConnected(host.identity, true);
  service.updateSettings(host.identity, {
    discussionMinutes: 1,
    allowNoExile: false,
    hideSpecialRoles: false,
    showFinalTimeline,
    specialRoles,
  });
  for (const member of members) service.setReady(member.identity, true);
  const lobbyVersion = service.project(host.identity).public.version;
  service.startGame(host.identity);
  return { database, service, host, members, lobbyVersion };
}

function byRole(
  service: GameService,
  members: Member[],
  role: RoleId,
  occurrence = 0,
): Member {
  const matching = members.filter(
    (member) => service.project(member.identity).private.role === role,
  );
  const member = matching[occurrence];
  assert.ok(member, `missing ${role} ${occurrence}`);
  return member;
}

let commandSequence = 0;
function submit(
  service: GameService,
  member: Member,
  action: GameActionType,
  targets: string[],
): GameSnapshot {
  const current = service.project(member.identity);
  return service.submitCommand(member.identity, {
    commandId: `correction-command-${commandSequence++}`,
    expectedVersion: current.public.version,
    expectedPhase: current.public.phase,
    action,
    targets,
  }).snapshot;
}

function expire(service: GameService, database: DatabaseSync): void {
  database.exec(
    "UPDATE phases SET deadline = '2000-01-01T00:00:00.000Z' WHERE closed_at IS NULL; UPDATE games SET deadline = '2000-01-01T00:00:00.000Z' WHERE status = 'active'",
  );
  assert.equal(service.runDuePhases(), 1);
}

function advanceDawnToNight(
  service: GameService,
  database: DatabaseSync,
): void {
  expire(service, database);
  expire(service, database);
  expire(service, database);
  expire(service, database);
}

function effectCount(database: DatabaseSync, type: string): number {
  return (
    database
      .prepare('SELECT count(*) AS count FROM effects WHERE effect_type = ?')
      .get(type) as { count: number }
  ).count;
}

void test('an assignment failure rolls back the complete game start', () => {
  const database = new DatabaseSync(':memory:');
  migrateUp(database);
  const base = createDomainAdapter((maximum) => maximum - 1);
  const broken: DomainAdapter = {
    ...base,
    assignRoles(participantIds, composition) {
      const assignments = base.assignRoles(participantIds, composition);
      return assignments.map((assignment, index) =>
        index === 1
          ? { ...assignment, participantId: assignments[0]!.participantId }
          : assignment,
      );
    },
  };
  const service = new GameService({
    database,
    domain: broken,
    logger: createLogger(() => undefined),
    sessionSecret: 'test-secret-that-is-at-least-32-characters',
    sessionTtlSeconds: 3_600,
  });
  try {
    const host = service.createRoom('Host');
    const members: Member[] = [host];
    for (let index = 1; index < 6; index += 1)
      members.push(service.joinRoom(host.identity.roomCode, `Player ${index}`));
    service.setConnected(host.identity, true);
    for (const member of members) service.setReady(member.identity, true);

    assert.throws(() => service.startGame(host.identity), /UNIQUE constraint/);
    assert.equal(
      (
        database.prepare('SELECT count(*) AS count FROM games').get() as {
          count: number;
        }
      ).count,
      0,
    );
    assert.equal(
      (
        database.prepare('SELECT count(*) AS count FROM assignments').get() as {
          count: number;
        }
      ).count,
      0,
    );
    assert.equal(service.project(host.identity).public.status, 'lobby');
  } finally {
    database.close();
  }
});

void test('Cupid gates the pack, stage timeout advances once, and Witch abstention preserves potions', () => {
  const { database, service, host, members, lobbyVersion } = fixture([
    'cupid',
    'witch',
    'doctor',
  ]);
  try {
    const cupid = byRole(service, members, 'cupid');
    const wolf = byRole(service, members, 'werewolf');
    const witch = byRole(service, members, 'witch');
    const doctor = byRole(service, members, 'doctor');
    const started = service.project(host.identity);
    assert.ok(started.public.version > lobbyVersion);
    assert.equal(started.public.phase, 'first-night');
    assert.equal(
      service.project(cupid.identity).private.availableAction?.type,
      'cupid-link',
    );
    assert.equal(service.project(wolf.identity).private.availableAction, null);

    expire(service, database);
    assert.equal(service.project(host.identity).public.phase, 'first-night');
    assert.equal(effectCount(database, 'abstention'), 1);
    assert.equal(
      service.project(wolf.identity).private.availableAction?.type,
      'wolf-vote',
    );

    const victim = witch.identity.participantId;
    const beforeVote = service.project(wolf.identity).public.version;
    submit(service, wolf, 'wolf-vote', [victim]);
    const witchView = service.project(witch.identity);
    assert.ok(witchView.public.version > beforeVote);
    assert.equal(witchView.private.availableAction?.type, 'witch-heal');
    assert.deepEqual(witchView.private.availableAction?.targets, [victim]);
    assert.equal(effectCount(database, 'wolf-target-locked'), 1);

    submit(service, doctor, 'doctor-protect', []);
    const dawn = submit(service, witch, 'witch-heal', []);
    assert.equal(dawn.public.phase, 'dawn');
    assert.deepEqual(dawn.private.resources, {
      healPotion: true,
      poisonPotion: true,
    });
  } finally {
    database.close();
  }
});

void test('pack target locks only after every living wolf submits', () => {
  const { database, service, members } = fixture(['witch'], 9);
  try {
    const firstWolf = byRole(service, members, 'werewolf', 0);
    const secondWolf = byRole(service, members, 'werewolf', 1);
    const witch = byRole(service, members, 'witch');
    const target = members.find(
      (member) =>
        ![firstWolf, secondWolf].includes(member) &&
        member.identity.participantId !== witch.identity.participantId,
    )!;
    submit(service, firstWolf, 'wolf-vote', [target.identity.participantId]);
    assert.equal(service.project(witch.identity).private.availableAction, null);
    assert.equal(effectCount(database, 'wolf-target-locked'), 0);
    submit(service, secondWolf, 'wolf-vote', [target.identity.participantId]);
    assert.equal(
      service.project(witch.identity).private.availableAction?.type,
      'witch-heal',
    );
    assert.equal(effectCount(database, 'wolf-target-locked'), 1);
  } finally {
    database.close();
  }
});

void test('alpha wolf shares pack votes and appears as village to the seer', () => {
  const { database, service, members } = fixture(['alpha-wolf', 'seer'], 9);
  try {
    const firstWolf = byRole(service, members, 'werewolf', 0);
    const secondWolf = byRole(service, members, 'werewolf', 1);
    const alphaWolf = byRole(service, members, 'alpha-wolf');
    const seer = byRole(service, members, 'seer');
    const targets = members.filter(
      (member) =>
        ![firstWolf, secondWolf, alphaWolf].includes(member) && member !== seer,
    );

    submit(service, firstWolf, 'wolf-vote', [
      targets[0]!.identity.participantId,
    ]);
    assert.ok(
      service
        .project(alphaWolf.identity)
        .private.knownPlayers.some(
          (known) =>
            known.fact === 'pack-target' &&
            known.playerId === targets[0]!.identity.participantId &&
            known.sourcePlayerId === firstWolf.identity.participantId,
        ),
    );

    submit(service, alphaWolf, 'wolf-vote', [
      targets[1]!.identity.participantId,
    ]);
    assert.ok(
      service
        .project(firstWolf.identity)
        .private.knownPlayers.some(
          (known) =>
            known.fact === 'pack-target' &&
            known.playerId === targets[1]!.identity.participantId &&
            known.sourcePlayerId === alphaWolf.identity.participantId,
        ),
    );

    submit(service, secondWolf, 'wolf-vote', []);
    submit(service, seer, 'seer-inspect', [alphaWolf.identity.participantId]);
    assert.equal(
      service
        .project(seer.identity)
        .public.players.filter(
          (player) =>
            targets
              .slice(0, 2)
              .some((target) => target.identity.participantId === player.id) &&
            !player.alive,
        ).length,
      1,
    );
    assert.ok(
      service
        .project(seer.identity)
        .private.knownPlayers.some(
          (known) =>
            known.playerId === alphaWolf.identity.participantId &&
            known.fact === 'village',
        ),
    );
  } finally {
    database.close();
  }
});

void test('a timed-out empty night stage chains directly to dawn', () => {
  const { database, service, host, members } = fixture([]);
  try {
    const villager = byRole(service, members, 'villager');
    assert.equal(
      service.project(villager.identity).private.availableAction,
      null,
    );
    expire(service, database);
    const dawn = service.project(host.identity);
    assert.equal(dawn.public.phase, 'dawn');
    assert.equal(dawn.public.announcements.length, 1);
    assert.equal(
      service.project(host.identity).public.announcements[0],
      dawn.public.announcements[0],
    );
  } finally {
    database.close();
  }
});

void test('an unprotected wolf target is dead and announced at dawn', () => {
  const { database, service, members } = fixture([]);
  try {
    const wolf = byRole(service, members, 'werewolf');
    const victim = byRole(service, members, 'villager');
    const dawn = submit(service, wolf, 'wolf-vote', [
      victim.identity.participantId,
    ]);
    const victimName = dawn.public.players.find(
      (player) => player.id === victim.identity.participantId,
    )?.nickname;

    assert.equal(dawn.public.phase, 'dawn');
    assert.ok(victimName);
    assert.equal(
      dawn.public.players.find(
        (player) => player.id === victim.identity.participantId,
      )?.alive,
      false,
    );
    assert.equal(dawn.public.announcements.length, 1);
    assert.match(dawn.public.announcements[0]!, new RegExp(victimName));
    const victimAfterlife = service.project(victim.identity).private.afterlife;
    assert.equal(victimAfterlife?.state, 'open');
    assert.equal(victimAfterlife?.entranceMessage, null);
    assert.equal(victimAfterlife?.availablePoints, 10);
    assert.equal(service.project(wolf.identity).private.afterlife, null);
    const initialPoints = database
      .prepare(
        `SELECT amount, data_json FROM afterlife_ledger
         WHERE game_id = (SELECT id FROM games LIMIT 1)
           AND participant_id = ? AND event_key = 'initial'`,
      )
      .get(victim.identity.participantId) as {
      amount: number;
      data_json: string;
    };
    assert.equal(initialPoints.amount, 10);
    assert.deepEqual(JSON.parse(initialPoints.data_json), {
      cause: 'wolf-attack',
    });
    const afterlifeRound = database
      .prepare(
        `SELECT r.round, r.closed_at, e.participant_id
         FROM afterlife_rounds r JOIN afterlife_entries e ON e.round_id = r.id
         WHERE r.game_id = (SELECT id FROM games LIMIT 1)`,
      )
      .get() as {
      round: number;
      closed_at: string | null;
      participant_id: string;
    };
    assert.equal(afterlifeRound.round, 1);
    assert.equal(afterlifeRound.closed_at, null);
    assert.equal(afterlifeRound.participant_id, victim.identity.participantId);
    expire(service, database);
    assert.equal(
      (
        database
          .prepare(
            `SELECT count(*) AS count FROM afterlife_ledger
             WHERE participant_id = ? AND event_key = 'initial'`,
          )
          .get(victim.identity.participantId) as { count: number }
      ).count,
      1,
    );
  } finally {
    database.close();
  }
});

void test('administrative removal does not create an afterlife balance', () => {
  const database = new DatabaseSync(':memory:');
  migrateUp(database);
  const service = new GameService({
    database,
    domain: createDomainAdapter(),
    logger: createLogger(() => undefined),
    sessionSecret: 'test-secret-that-is-at-least-32-characters',
    sessionTtlSeconds: 3_600,
  });
  try {
    const host = service.createRoom('Host');
    const guest = service.joinRoom(host.identity.roomCode, 'Guest');
    service.removeParticipant(host.identity, guest.identity.participantId);
    assert.equal(
      (
        database
          .prepare('SELECT count(*) AS count FROM afterlife_ledger')
          .get() as { count: number }
      ).count,
      0,
    );
  } finally {
    database.close();
  }
});

void test('afterlife entries replace choices atomically and reserve points', () => {
  const { database, service, members } = fixture([]);
  try {
    const wolf = byRole(service, members, 'werewolf');
    const dead = byRole(service, members, 'villager', 0);
    submit(service, wolf, 'wolf-vote', [dead.identity.participantId]);
    const living = service
      .project(dead.identity)
      .public.players.filter((player) => player.alive);
    const first = {
      commandId: 'afterlife-entry-first',
      expectedVersion: service.project(dead.identity).public.version,
      exileTargetId: living[0]!.id,
      werewolfTargetIds: [living[1]!.id],
      team: 'village',
      wager: 2,
    } as const;
    const accepted = service.replaceAfterlifeEntry(dead.identity, 1, first);
    assert.equal(accepted.duplicate, false);
    assert.equal(accepted.snapshot.private.afterlife?.availablePoints, 8);
    assert.equal(accepted.snapshot.private.afterlife?.state, 'open');
    if (accepted.snapshot.private.afterlife?.state === 'open') {
      assert.equal(
        accepted.snapshot.private.afterlife.entry.exileTargetId,
        living[0]!.id,
      );
    }
    const messageVersion = service.project(dead.identity).public.version;
    const message = {
      commandId: 'afterlife-message-first',
      expectedVersion: messageVersion,
      text: '  Ainda estou observando.  ',
    };
    const sent = service.sendAfterlifeMessage(dead.identity, message);
    assert.equal(sent.duplicate, false);
    assert.equal(
      sent.snapshot.private.afterlife?.messages[0]?.text,
      'Ainda estou observando.',
    );
    assert.equal(
      service.sendAfterlifeMessage(dead.identity, message).duplicate,
      true,
    );
    assert.equal(
      (
        database
          .prepare('SELECT count(*) AS count FROM afterlife_messages')
          .get() as { count: number }
      ).count,
      1,
    );
    assert.throws(
      () =>
        service.sendAfterlifeMessage(wolf.identity, {
          commandId: 'afterlife-message-living',
          expectedVersion: service.project(wolf.identity).public.version,
          text: 'Not allowed',
        }),
      /Only eliminated players/,
    );
    assert.throws(
      () =>
        service.sendAfterlifeMessage(dead.identity, {
          commandId: 'afterlife-message-empty',
          expectedVersion: service.project(dead.identity).public.version,
          text: '   ',
        }),
      /1 to 500 characters/,
    );
    assert.equal(
      service.replaceAfterlifeEntry(dead.identity, 1, first).duplicate,
      true,
    );
    const stored = database
      .prepare(
        `SELECT exile_target_id, werewolf_targets_json, team, wager
         FROM afterlife_entries WHERE participant_id = ?`,
      )
      .get(dead.identity.participantId) as {
      exile_target_id: string;
      werewolf_targets_json: string;
      team: string;
      wager: number;
    };
    assert.equal(stored.exile_target_id, living[0]!.id);
    assert.deepEqual(JSON.parse(stored.werewolf_targets_json), [living[1]!.id]);
    assert.equal(stored.team, 'village');
    assert.equal(stored.wager, 2);

    assert.throws(
      () =>
        service.replaceAfterlifeEntry(dead.identity, 1, {
          ...first,
          commandId: 'afterlife-entry-duplicate-target',
          expectedVersion: service.project(dead.identity).public.version,
          werewolfTargetIds: [living[0]!.id, living[0]!.id],
        }),
      /Invalid werewolf targets/,
    );
    assert.throws(
      () =>
        service.replaceAfterlifeEntry(dead.identity, 1, {
          ...first,
          commandId: 'afterlife-entry-dead-target',
          expectedVersion: service.project(dead.identity).public.version,
          exileTargetId: dead.identity.participantId,
        }),
      /must target living players/,
    );

    database
      .prepare(
        "UPDATE afterlife_ledger SET amount = 2 WHERE participant_id = ? AND event_key = 'initial'",
      )
      .run(dead.identity.participantId);
    assert.throws(
      () =>
        service.replaceAfterlifeEntry(dead.identity, 1, {
          ...first,
          commandId: 'afterlife-entry-no-balance',
          expectedVersion: service.project(dead.identity).public.version,
          wager: 3,
        }),
      /Not enough afterlife points/,
    );
    assert.equal(
      (
        database
          .prepare(
            'SELECT wager FROM afterlife_entries WHERE participant_id = ?',
          )
          .get(dead.identity.participantId) as { wager: number }
      ).wager,
      2,
    );
  } finally {
    database.close();
  }
});

void test('afterlife settlement scores marks, wagers, floor, ranking, and ties once', () => {
  const { database, service, members } = fixture([]);
  try {
    const wolf = byRole(service, members, 'werewolf');
    const firstDead = byRole(service, members, 'villager', 0);
    submit(service, wolf, 'wolf-vote', [firstDead.identity.participantId]);
    const nonWolves = members.filter(
      (member) =>
        service.project(member.identity).private.role !== 'werewolf' &&
        member !== firstDead,
    );
    const innocent = nonWolves[0]!;
    service.replaceAfterlifeEntry(firstDead.identity, 1, {
      commandId: 'afterlife-final-first',
      expectedVersion: service.project(firstDead.identity).public.version,
      exileTargetId: innocent.identity.participantId,
      werewolfTargetIds: [
        wolf.identity.participantId,
        innocent.identity.participantId,
      ],
      team: 'werewolves',
      wager: 2,
    });
    const gameId = (
      database.prepare('SELECT id FROM games LIMIT 1').get() as { id: string }
    ).id;
    const roundId = (
      database
        .prepare(
          'SELECT id FROM afterlife_rounds WHERE game_id = ? AND round = 1',
        )
        .get(gameId) as { id: string }
    ).id;
    const tied = nonWolves[1]!;
    const floored = nonWolves[2]!;
    database
      .prepare(
        `INSERT INTO afterlife_ledger
          (id, game_id, participant_id, round, reason, event_key, amount, created_at)
         VALUES (?, ?, ?, 1, 'initial', 'initial', ?, '2026-01-01')`,
      )
      .run('tied-initial', gameId, tied.identity.participantId, 10);
    database
      .prepare(
        `INSERT INTO afterlife_ledger
          (id, game_id, participant_id, round, reason, event_key, amount, created_at)
         VALUES (?, ?, ?, 1, 'initial', 'initial', ?, '2026-01-01')`,
      )
      .run('floored-initial', gameId, floored.identity.participantId, 1);
    const insertEntry = database.prepare(
      `INSERT INTO afterlife_entries
        (round_id, participant_id, exile_target_id, werewolf_targets_json, team, wager, submitted_at)
       VALUES (?, ?, ?, ?, ?, ?, '2026-01-01')`,
    );
    insertEntry.run(
      roundId,
      tied.identity.participantId,
      innocent.identity.participantId,
      JSON.stringify([
        wolf.identity.participantId,
        innocent.identity.participantId,
      ]),
      'werewolves',
      2,
    );
    insertEntry.run(
      roundId,
      floored.identity.participantId,
      innocent.identity.participantId,
      JSON.stringify(
        nonWolves.slice(0, 3).map((member) => member.identity.participantId),
      ),
      'village',
      3,
    );
    const survivor = nonWolves.find(
      (member) => member !== tied && member !== floored,
    )!;
    database
      .prepare(
        'UPDATE assignments SET alive = CASE WHEN participant_id IN (?, ?) THEN 1 ELSE 0 END WHERE game_id = ?',
      )
      .run(
        wolf.identity.participantId,
        survivor.identity.participantId,
        gameId,
      );

    expire(service, database);
    const final = service.project(firstDead.identity).private.afterlife;
    assert.equal(final?.state, 'finished');
    if (final?.state !== 'finished') throw new Error('missing final afterlife');
    assert.equal(final.availablePoints, 12);
    assert.deepEqual(
      final.ranking.map(({ points, rank, oracle }) => ({
        points,
        rank,
        oracle,
      })),
      [
        { points: 12, rank: 1, oracle: true },
        { points: 12, rank: 1, oracle: true },
        { points: 0, rank: 3, oracle: false },
      ],
    );
    assert.equal(final.oracleIds.length, 2);
    assert.throws(
      () =>
        service.sendAfterlifeMessage(firstDead.identity, {
          commandId: 'afterlife-message-finished',
          expectedVersion: service.project(firstDead.identity).public.version,
          text: 'Too late',
        }),
      /game is finished/i,
    );
    const settledCount = (
      database
        .prepare(
          "SELECT count(*) AS count FROM afterlife_ledger WHERE reason IN ('werewolf-mark', 'team-wager')",
        )
        .get() as { count: number }
    ).count;
    assert.equal(service.runDuePhases(), 0);
    assert.equal(
      (
        database
          .prepare(
            "SELECT count(*) AS count FROM afterlife_ledger WHERE reason IN ('werewolf-mark', 'team-wager')",
          )
          .get() as { count: number }
      ).count,
      settledCount,
    );
  } finally {
    database.close();
  }
});

void test('seer knowledge remains private from villagers and every other role', () => {
  const { database, service, members } = fixture(['seer']);
  try {
    const wolf = byRole(service, members, 'werewolf');
    const seer = byRole(service, members, 'seer');
    submit(service, wolf, 'wolf-vote', []);
    assert.equal(
      service.project(seer.identity).private.availableAction?.type,
      'seer-inspect',
    );
    submit(service, seer, 'seer-inspect', [wolf.identity.participantId]);

    assert.deepEqual(service.project(seer.identity).private.knownPlayers, [
      { playerId: wolf.identity.participantId, fact: 'werewolves' },
    ]);
    for (const member of members) {
      if (member === seer) continue;
      assert.deepEqual(
        service.project(member.identity).private.knownPlayers,
        [],
      );
    }
  } finally {
    database.close();
  }
});

void test('Little Girl exposes a deliberate spy action, not an abstention', () => {
  const { database, service, members } = fixture(['little-girl']);
  try {
    const wolf = byRole(service, members, 'werewolf');
    const littleGirl = byRole(service, members, 'little-girl');
    submit(service, wolf, 'wolf-vote', []);
    const action = service.project(littleGirl.identity).private.availableAction;
    assert.equal(action?.type, 'little-girl-spy');
    assert.equal(action?.allowAbstain, false);
    assert.deepEqual(action?.targets, []);
  } finally {
    database.close();
  }
});

void test('Hunter resumes dawn after a night death and night after a day death', () => {
  const night = fixture(['hunter']);
  try {
    const wolf = byRole(night.service, night.members, 'werewolf');
    const hunter = byRole(night.service, night.members, 'hunter');
    submit(night.service, wolf, 'wolf-vote', [hunter.identity.participantId]);
    assert.equal(
      night.service.project(hunter.identity).public.phase,
      'hunter-shot',
    );
    const shotTarget = byRole(night.service, night.members, 'villager');
    assert.equal(
      submit(night.service, hunter, 'hunter-shoot', [
        shotTarget.identity.participantId,
      ]).public.phase,
      'dawn',
    );
    assert.equal(
      night.service
        .project(hunter.identity)
        .public.players.find(
          (player) => player.id === shotTarget.identity.participantId,
        )?.alive,
      false,
    );
  } finally {
    night.database.close();
  }

  const day = fixture(['hunter']);
  try {
    const wolf = byRole(day.service, day.members, 'werewolf');
    const hunter = byRole(day.service, day.members, 'hunter');
    submit(day.service, wolf, 'wolf-vote', []);
    expire(day.service, day.database);
    expire(day.service, day.database);
    assert.equal(day.service.project(hunter.identity).public.phase, 'voting');
    for (const member of day.members) {
      submit(
        day.service,
        member,
        'day-vote',
        member.identity.participantId === hunter.identity.participantId
          ? []
          : [hunter.identity.participantId],
      );
    }
    assert.equal(
      day.service.project(hunter.identity).public.phase,
      'hunter-shot',
    );
    expire(day.service, day.database);
    assert.equal(
      day.service.project(hunter.identity).public.phase,
      'day-resolution',
    );
    for (const member of day.members) {
      const self = day.service
        .project(member.identity)
        .public.players.find(
          (player) => player.id === member.identity.participantId,
        );
      if (self?.alive) day.service.acknowledgeDayResolution(member.identity, 1);
    }
    assert.equal(day.service.project(hunter.identity).public.phase, 'night');
    submit(day.service, wolf, 'wolf-vote', []);
    assert.equal(day.service.project(hunter.identity).public.phase, 'dawn');
    assert.ok(
      day.database
        .prepare(
          `SELECT 1 FROM afterlife_entries e
           JOIN afterlife_rounds r ON r.id = e.round_id
           WHERE r.round = 2 AND e.participant_id = ?`,
        )
        .get(hunter.identity.participantId),
    );
  } finally {
    day.database.close();
  }
});

void test('day votes resolve when voting closes and results are visible in day-resolution', () => {
  const { database, service, host, members } = fixture([]);
  try {
    const wolf = byRole(service, members, 'werewolf');
    submit(service, wolf, 'wolf-vote', []);
    expire(service, database);
    expire(service, database);
    const vote = service.project(host.identity).private.availableAction;
    assert.equal(vote?.type, 'day-vote');
    assert.equal(vote?.allowAbstain, true);
    assert.ok(!vote?.targets.includes('no-exile'));
    for (const member of members) submit(service, member, 'day-vote', []);
    const result = service.project(host.identity);
    assert.equal(result.public.phase, 'day-resolution');
    assert.ok(
      result.public.announcements.some((item) =>
        item.includes('Nenhum jogador foi expulso'),
      ),
    );
    assert.equal(effectCount(database, 'day-vote-result'), 1);
    assert.ok(
      (
        database
          .prepare(
            'SELECT closed_at, settled_at FROM afterlife_rounds WHERE round = 1',
          )
          .get() as { closed_at: string | null; settled_at: string | null }
      ).closed_at,
    );
    assert.ok(
      (
        database
          .prepare('SELECT settled_at FROM afterlife_rounds WHERE round = 1')
          .get() as { settled_at: string | null }
      ).settled_at,
    );
    assert.equal(
      (
        database
          .prepare(
            "SELECT count(*) AS count FROM afterlife_ledger WHERE reason = 'exile-prediction'",
          )
          .get() as { count: number }
      ).count,
      0,
    );
  } finally {
    database.close();
  }
});

void test('an exile is announced only once in day-resolution', () => {
  const { database, service, members } = fixture([]);
  try {
    const wolf = byRole(service, members, 'werewolf');
    const nightVictim = byRole(service, members, 'villager', 0);
    const target = byRole(service, members, 'villager', 1);
    const dawn = submit(service, wolf, 'wolf-vote', [
      nightVictim.identity.participantId,
    ]);
    const nightVictimName = dawn.public.players.find(
      (player) => player.id === nightVictim.identity.participantId,
    )?.nickname;
    assert.ok(nightVictimName);
    const nightAnnouncement = dawn.public.announcements[0];
    assert.ok(nightAnnouncement);
    assert.ok(nightAnnouncement.includes(nightVictimName));
    expire(service, database);
    service.replaceAfterlifeEntry(nightVictim.identity, 1, {
      commandId: 'afterlife-correct-exile',
      expectedVersion: service.project(nightVictim.identity).public.version,
      exileTargetId: target.identity.participantId,
      werewolfTargetIds: [],
      team: 'village',
      wager: 1,
    });
    expire(service, database);
    for (const member of members) {
      if (member === nightVictim) continue;
      submit(
        service,
        member,
        'day-vote',
        member === target ? [] : [target.identity.participantId],
      );
    }

    const resolution = service.project(target.identity);
    const targetName = resolution.public.players.find(
      (player) => player.id === target.identity.participantId,
    )?.nickname;
    assert.ok(targetName);
    assert.ok(
      resolution.public.announcements.includes(`${targetName} foi expulso.`),
    );
    assert.ok(
      !resolution.public.announcements.includes(`${targetName} foi eliminado.`),
    );
    assert.ok(!resolution.public.announcements.includes(nightAnnouncement));
    assert.equal(
      resolution.private.afterlife?.entranceMessage,
      'A vila encerrou sua jornada, mas seu espírito continua observando. Faça suas previsões e dispute o título de Oráculo do Além.',
    );
    assert.equal(resolution.private.afterlife?.state, 'waiting');
    const livingView = members.find(
      (member) =>
        resolution.public.players.find(
          (player) => player.id === member.identity.participantId,
        )?.alive,
    )!;
    assert.equal(service.project(livingView.identity).private.afterlife, null);
    const predictionCredit = database
      .prepare(
        `SELECT amount FROM afterlife_ledger
         WHERE participant_id = ? AND reason = 'exile-prediction'`,
      )
      .get(nightVictim.identity.participantId) as { amount: number };
    assert.equal(predictionCredit.amount, 3);
    assert.equal(
      database
        .prepare(
          `SELECT 1 FROM afterlife_entries e
           JOIN afterlife_rounds r ON r.id = e.round_id
           WHERE r.round = 1 AND e.participant_id = ?`,
        )
        .get(target.identity.participantId),
      undefined,
    );
  } finally {
    database.close();
  }
});

void test('a living majority can end discussion and open voting early', () => {
  const { database, service, members } = fixture([]);
  try {
    const wolf = byRole(service, members, 'werewolf');
    submit(service, wolf, 'wolf-vote', []);
    expire(service, database);
    assert.equal(
      service.project(members[0]!.identity).public.phase,
      'discussion',
    );

    for (const member of members.slice(0, 3)) {
      const snapshot = service.markReadyForVote(member.identity);
      assert.equal(snapshot.public.phase, 'discussion');
    }
    const waiting = service.project(members[0]!.identity);
    assert.deepEqual(waiting.public.discussionReadiness, {
      readyCount: 3,
      requiredCount: 4,
    });
    assert.equal(waiting.private.readyForVote, true);

    const voting = service.markReadyForVote(members[3]!.identity);
    assert.equal(voting.public.phase, 'voting');
    assert.equal(voting.public.discussionReadiness, null);
  } finally {
    database.close();
  }
});

void test('Doctor repeat restriction compares only the immediately previous night', () => {
  const { database, service, members } = fixture(['doctor']);
  try {
    const wolf = byRole(service, members, 'werewolf');
    const doctor = byRole(service, members, 'doctor');
    const target = members.find(
      (member) =>
        member.identity.participantId !== doctor.identity.participantId,
    )!;

    submit(service, wolf, 'wolf-vote', []);
    submit(service, doctor, 'doctor-protect', [target.identity.participantId]);
    advanceDawnToNight(service, database);
    submit(service, wolf, 'wolf-vote', []);
    assert.equal(
      service
        .project(doctor.identity)
        .private.availableAction?.targets.includes(
          target.identity.participantId,
        ),
      false,
    );
    submit(service, doctor, 'doctor-protect', []);
    advanceDawnToNight(service, database);
    submit(service, wolf, 'wolf-vote', []);
    assert.ok(
      service
        .project(doctor.identity)
        .private.availableAction?.targets.includes(
          target.identity.participantId,
        ),
    );
  } finally {
    database.close();
  }
});

void test('a werewolf victory includes dead faction members', () => {
  const { database, service, members } = fixture([], 9, false);
  try {
    const deadWolf = byRole(service, members, 'werewolf', 0);
    const livingWolf = byRole(service, members, 'werewolf', 1);
    const survivor = members.find(
      (member) => service.project(member.identity).private.role !== 'werewolf',
    )!;
    database
      .prepare(
        'UPDATE assignments SET alive = CASE WHEN participant_id IN (?, ?) THEN 1 ELSE 0 END',
      )
      .run(livingWolf.identity.participantId, survivor.identity.participantId);
    submit(service, livingWolf, 'wolf-vote', []);
    const final = service.project(deadWolf.identity);
    assert.equal(final.public.winner, 'werewolves');
    assert.equal(final.finalEvents, undefined);
    const wolfResults = final.finalRoles?.filter(
      (role) => role.role === 'werewolf',
    );
    assert.equal(wolfResults?.length, 2);
    assert.equal(
      wolfResults?.every((role) => role.winner),
      true,
    );
  } finally {
    database.close();
  }
});
