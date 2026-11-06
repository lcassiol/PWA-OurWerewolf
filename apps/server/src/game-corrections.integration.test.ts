import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { createDomainAdapter, type DomainAdapter } from './domain-adapter.js';
import type { GameActionType, GameSnapshot, RoleId } from './contracts.js';
import { migrateUp } from './db/migrate.js';
import { GameService, type Identity } from './game-service.js';
import { createLogger } from './logger.js';

type Member = { identity: Identity; credential: string };

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
    allowNoExile: true,
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

void test('a timed-out empty night stage chains directly to dawn', () => {
  const { database, service, host, members } = fixture([]);
  try {
    const villager = byRole(service, members, 'villager');
    assert.equal(
      service.project(villager.identity).private.availableAction,
      null,
    );
    expire(service, database);
    assert.equal(service.project(host.identity).public.phase, 'dawn');
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
    assert.equal(day.service.project(hunter.identity).public.phase, 'night');
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
    for (const member of members) submit(service, member, 'day-vote', []);
    const result = service.project(host.identity);
    assert.equal(result.public.phase, 'day-resolution');
    assert.ok(
      result.public.announcements.some((item) =>
        item.includes('Nenhum jogador foi expulso'),
      ),
    );
    assert.equal(effectCount(database, 'day-vote-result'), 1);
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
