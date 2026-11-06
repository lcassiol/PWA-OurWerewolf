import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { WebSocket, type RawData } from 'ws';
import type { GameSnapshot, RoomSettings } from './contracts.js';
import { loadConfig, type ServerConfig } from './env.js';
import { createLogger } from './logger.js';
import { clientAddress, createApplication } from './server.js';

const origin = 'http://client.test';

function config(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    port: 0,
    databasePath: ':memory:',
    allowedOrigins: new Set([origin]),
    sessionSecret: 'test-secret-that-is-at-least-32-characters',
    cookieSecure: false,
    sessionTtlSeconds: 3_600,
    createRateLimit: 100,
    joinRateLimit: 100,
    rateLimitWindowMs: 60_000,
    deadlinePollMs: 60_000,
    ...overrides,
  };
}

type RunningApp = ReturnType<typeof createApplication> & { baseUrl: string };

async function start(
  overrides: Partial<ServerConfig> = {},
  logLines: string[] = [],
  now?: () => Date,
  generateCode?: () => string,
): Promise<RunningApp> {
  const database = new DatabaseSync(':memory:');
  const application = createApplication({
    config: config(overrides),
    database,
    logger: createLogger((line) => logLines.push(line)),
    startDeadlineRunner: false,
    ...(now ? { now } : {}),
    ...(generateCode ? { generateCode } : {}),
  });
  application.server.listen(0, '127.0.0.1');
  await once(application.server, 'listening');
  const port = (application.server.address() as AddressInfo).port;
  return Object.assign(application, { baseUrl: `http://127.0.0.1:${port}` });
}

async function stop(application: RunningApp): Promise<void> {
  await application.close();
  application.database.close();
}

async function request(
  application: RunningApp,
  path: string,
  init: RequestInit = {},
) {
  return fetch(`${application.baseUrl}${path}`, {
    ...init,
    headers: { origin, 'content-type': 'application/json', ...init.headers },
  });
}

function cookie(response: Response): string {
  const value = response.headers.get('set-cookie');
  assert.ok(value);
  return value.split(';', 1)[0]!;
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

async function createRoom(application: RunningApp, nickname = 'Host') {
  const response = await request(application, '/rooms', {
    method: 'POST',
    body: JSON.stringify({ nickname }),
  });
  assert.equal(response.status, 201);
  const body = await json<{ snapshot: GameSnapshot }>(response);
  return { cookie: cookie(response), snapshot: body.snapshot };
}

type Member = Awaited<ReturnType<typeof createRoom>>;

async function getSnapshot(
  application: RunningApp,
  code: string,
  member: Member,
): Promise<GameSnapshot> {
  const response = await request(application, `/rooms/${code}/snapshot`, {
    headers: { cookie: member.cookie },
  });
  assert.equal(response.status, 200);
  return (await json<{ snapshot: GameSnapshot }>(response)).snapshot;
}

async function connectMember(
  application: RunningApp,
  member: Member,
): Promise<WebSocket> {
  const socket = new WebSocket(
    `${application.baseUrl.replace('http', 'ws')}/ws?room=${member.snapshot.public.roomCode}`,
    { headers: { cookie: member.cookie, origin } },
  );
  await once(socket, 'open');
  await new Promise((resolve) => setTimeout(resolve, 10));
  return socket;
}

function expireOpenPhase(application: RunningApp): void {
  application.database.exec(
    "UPDATE phases SET deadline = '2000-01-01T00:00:00.000Z' WHERE closed_at IS NULL; UPDATE games SET deadline = '2000-01-01T00:00:00.000Z' WHERE status = 'active'",
  );
}

void test('environment validation and structured logger redact credentials and private fields', () => {
  assert.throws(
    () => loadConfig({ SESSION_SECRET: 'short' }),
    /SESSION_SECRET/,
  );
  assert.throws(
    () =>
      loadConfig({
        SESSION_SECRET: 'x'.repeat(32),
        ALLOWED_ORIGINS: 'not a URL',
      }),
    /ALLOWED_ORIGINS/,
  );
  const lines: string[] = [];
  createLogger((line) => lines.push(line)).log('info', 'test', {
    credential: 'credential-value',
    nested: { role: 'werewolf', targets: ['private-player'] },
    safe: 'visible',
  });
  assert.equal(lines.length, 1);
  assert.doesNotMatch(lines[0]!, /credential-value|werewolf|private-player/);
  assert.match(lines[0]!, /"safe":"visible"/);
});

void test('room edge cases preserve authorization and frozen lobby state', async () => {
  const codes = ['CLSH', 'CLSH', 'NEXT'];
  const application = await start({}, [], undefined, () => codes.shift()!);
  let hostSocket: WebSocket | undefined;
  try {
    const host = await createRoom(application, 'Host A');
    const otherRoom = await createRoom(application, 'Host B');
    assert.equal(host.snapshot.public.roomCode, 'CLSH');
    assert.equal(otherRoom.snapshot.public.roomCode, 'NEXT');
    assert.equal(host.snapshot.public.settings.allowNoExile, false);
    const code = host.snapshot.public.roomCode;
    hostSocket = await connectMember(application, host);

    const missing = await request(application, '/rooms/ZZZZ/join', {
      method: 'POST',
      body: JSON.stringify({ nickname: 'Nobody' }),
    });
    assert.equal(missing.status, 404);
    assert.equal(
      'snapshot' in (await json<Record<string, unknown>>(missing)),
      false,
    );

    const crossRoom = await request(
      application,
      `/rooms/${otherRoom.snapshot.public.roomCode}/snapshot`,
      { headers: { cookie: host.cookie } },
    );
    assert.equal(crossRoom.status, 401);

    const guestResponse = await request(application, `/rooms/${code}/join`, {
      method: 'POST',
      body: JSON.stringify({ nickname: 'Guest' }),
    });
    const guest: Member = {
      cookie: cookie(guestResponse),
      snapshot: (await json<{ snapshot: GameSnapshot }>(guestResponse))
        .snapshot,
    };
    const saved = await request(application, `/rooms/${code}/settings`, {
      method: 'PATCH',
      headers: { cookie: host.cookie },
      body: JSON.stringify({
        discussionMinutes: 7,
        allowNoExile: false,
        hideSpecialRoles: true,
        showFinalTimeline: true,
        specialRoles: ['seer'],
      }),
    });
    assert.equal(saved.status, 200);
    const savedSnapshot = (await json<{ snapshot: GameSnapshot }>(saved))
      .snapshot;
    assert.equal(savedSnapshot.public.settings.discussionMinutes, 7);
    assert.equal(savedSnapshot.public.settings.allowNoExile, false);
    assert.equal(savedSnapshot.public.settings.hideSpecialRoles, true);
    assert.deepEqual(savedSnapshot.public.settings.specialRoles, []);
    assert.deepEqual(savedSnapshot.host?.configuredSpecialRoles, ['seer']);
    const guestSettings = (await getSnapshot(application, code, guest)).public
      .settings;
    assert.equal(guestSettings.allowNoExile, false);
    assert.equal(guestSettings.hideSpecialRoles, true);
    assert.deepEqual(guestSettings.specialRoles, []);
    const forbidden = await request(application, `/rooms/${code}/settings`, {
      method: 'PATCH',
      headers: { cookie: guest.cookie },
      body: JSON.stringify({
        discussionMinutes: 1,
        allowNoExile: true,
        hideSpecialRoles: false,
        showFinalTimeline: true,
        specialRoles: [],
      }),
    });
    assert.equal(forbidden.status, 403);
    assert.equal(
      (await getSnapshot(application, code, host)).public.settings
        .discussionMinutes,
      7,
    );
    const invalidStart = await request(application, `/rooms/${code}/start`, {
      method: 'POST',
      headers: { cookie: host.cookie },
      body: '{}',
    });
    assert.equal(invalidStart.status, 409);
    assert.equal(
      (await getSnapshot(application, code, host)).public.status,
      'lobby',
    );

    const members: Member[] = [host, guest];
    for (let index = 2; index < 6; index += 1) {
      const joined = await request(application, `/rooms/${code}/join`, {
        method: 'POST',
        body: JSON.stringify({ nickname: `Ready ${index}` }),
      });
      members.push({
        cookie: cookie(joined),
        snapshot: (await json<{ snapshot: GameSnapshot }>(joined)).snapshot,
      });
    }
    for (const member of members)
      assert.equal(
        (
          await request(application, `/rooms/${code}/ready`, {
            method: 'PATCH',
            headers: { cookie: member.cookie },
            body: JSON.stringify({ ready: true }),
          })
        ).status,
        200,
      );
    const concurrentStarts = await Promise.all([
      request(application, `/rooms/${code}/start`, {
        method: 'POST',
        headers: { cookie: host.cookie },
        body: '{}',
      }),
      request(application, `/rooms/${code}/start`, {
        method: 'POST',
        headers: { cookie: host.cookie },
        body: '{}',
      }),
    ]);
    assert.deepEqual(
      concurrentStarts.map((response) => response.status).sort(),
      [200, 409],
    );
    assert.equal(
      (
        application.database
          .prepare('SELECT count(*) AS count FROM games')
          .get() as { count: number }
      ).count,
      1,
    );
    const frozenSettings = JSON.parse(
      (
        application.database
          .prepare('SELECT frozen_settings_json FROM games')
          .get() as { frozen_settings_json: string }
      ).frozen_settings_json,
    ) as RoomSettings;
    assert.deepEqual(frozenSettings.specialRoles, ['seer']);
    const playingGuestSettings = (await getSnapshot(application, code, guest))
      .public.settings;
    assert.equal(playingGuestSettings.hideSpecialRoles, true);
    assert.deepEqual(playingGuestSettings.specialRoles, []);
    const lateJoin = await request(application, `/rooms/${code}/join`, {
      method: 'POST',
      body: JSON.stringify({ nickname: 'Too Late' }),
    });
    assert.equal(lateJoin.status, 409);
    assert.equal(lateJoin.headers.get('set-cookie'), null);
    const frozen = await request(application, `/rooms/${code}/settings`, {
      method: 'PATCH',
      headers: { cookie: host.cookie },
      body: JSON.stringify({
        discussionMinutes: 1,
        allowNoExile: true,
        hideSpecialRoles: false,
        showFinalTimeline: true,
        specialRoles: [],
      }),
    });
    assert.equal(frozen.status, 409);
    assert.equal(
      (await getSnapshot(application, code, host)).public.settings
        .discussionMinutes,
      7,
    );
  } finally {
    hostSocket?.terminate();
    await stop(application);
  }
});

void test('health, room lifecycle, atomic start, projections, idempotency, and deadlines', async () => {
  const logs: string[] = [];
  const application = await start({}, logs);
  let hostSocket: WebSocket | undefined;
  try {
    const health = await request(application, '/health');
    assert.equal(health.status, 200);
    assert.deepEqual(await json(health), { status: 'ok' });

    const host = await createRoom(application);
    hostSocket = await connectMember(application, host);
    const code = host.snapshot.public.roomCode;
    const restored = await request(application, '/session', {
      headers: { cookie: host.cookie },
    });
    assert.equal(restored.status, 200);
    assert.equal(
      (await json<{ snapshot: GameSnapshot }>(restored)).snapshot.private
        .playerId,
      host.snapshot.private.playerId,
    );
    const members = [{ ...host }];
    for (let index = 1; index < 6; index += 1) {
      const joined = await request(application, `/rooms/${code}/join`, {
        method: 'POST',
        body: JSON.stringify({ nickname: `Player ${index}` }),
      });
      assert.equal(joined.status, 201);
      members.push({
        cookie: cookie(joined),
        snapshot: (await json<{ snapshot: GameSnapshot }>(joined)).snapshot,
      });
    }

    const duplicate = await request(application, `/rooms/${code}/join`, {
      method: 'POST',
      body: JSON.stringify({ nickname: 'player 1' }),
    });
    assert.equal(duplicate.status, 409);
    const wrongOrigin = await fetch(
      `${application.baseUrl}/rooms/${code}/ready`,
      {
        method: 'PATCH',
        headers: {
          origin: 'http://evil.test',
          'content-type': 'application/json',
          cookie: host.cookie,
        },
        body: JSON.stringify({ ready: true }),
      },
    );
    assert.equal(wrongOrigin.status, 403);

    for (const member of members) {
      const ready = await request(application, `/rooms/${code}/ready`, {
        method: 'PATCH',
        headers: { cookie: member.cookie },
        body: JSON.stringify({ ready: true }),
      });
      assert.equal(ready.status, 200);
    }
    const started = await request(application, `/rooms/${code}/start`, {
      method: 'POST',
      headers: { cookie: host.cookie },
      body: '{}',
    });
    assert.equal(started.status, 200);

    const snapshots: Array<{ cookie: string; snapshot: GameSnapshot }> = [];
    for (const member of members) {
      const response = await request(application, `/rooms/${code}/snapshot`, {
        headers: { cookie: member.cookie },
      });
      assert.equal(response.status, 200);
      snapshots.push({
        cookie: member.cookie,
        snapshot: (await json<{ snapshot: GameSnapshot }>(response)).snapshot,
      });
    }
    assert.equal(
      snapshots.every(({ snapshot }) => snapshot.private.role !== null),
      true,
    );
    assert.equal('role' in snapshots[0]!.snapshot.public.players[1]!, false);
    assert.equal(snapshots[0]!.snapshot.finalRoles, undefined);
    assert.equal(snapshots[0]!.snapshot.host?.canConfigure, false);

    const actor = snapshots.find(
      ({ snapshot }) => snapshot.private.availableAction,
    );
    assert.ok(actor?.snapshot.private.availableAction);
    const available = actor.snapshot.private.availableAction;
    const command = {
      commandId: 'command-0001',
      expectedVersion: actor.snapshot.public.version,
      expectedPhase: actor.snapshot.public.phase,
      action: available.type,
      targets: available.targets.slice(0, available.minTargets),
    };
    const first = await request(application, `/rooms/${code}/commands`, {
      method: 'POST',
      headers: { cookie: actor.cookie },
      body: JSON.stringify(command),
    });
    assert.equal(first.status, 200);
    const firstBody = await json<{
      duplicate: boolean;
      snapshot: GameSnapshot;
    }>(first);
    assert.equal(firstBody.duplicate, false);
    const repeated = await request(application, `/rooms/${code}/commands`, {
      method: 'POST',
      headers: { cookie: actor.cookie },
      body: JSON.stringify(command),
    });
    assert.equal(repeated.status, 200);
    const repeatedBody = await json<{
      duplicate: boolean;
      snapshot: GameSnapshot;
    }>(repeated);
    assert.equal(repeatedBody.duplicate, true);
    assert.equal(
      repeatedBody.snapshot.public.version,
      firstBody.snapshot.public.version,
    );
    const stale = await request(application, `/rooms/${code}/commands`, {
      method: 'POST',
      headers: { cookie: actor.cookie },
      body: JSON.stringify({
        ...command,
        commandId: 'command-stale-response',
      }),
    });
    assert.equal(stale.status, 409);
    const staleBody = await json<{
      error: { code: string };
      snapshot: GameSnapshot;
    }>(stale);
    assert.ok(['stale_command', 'phase_closed'].includes(staleBody.error.code));
    assert.equal(
      staleBody.snapshot.public.version,
      firstBody.snapshot.public.version,
    );
    const actionCount = application.database
      .prepare('SELECT count(*) AS count FROM actions')
      .get() as { count: number };
    assert.equal(actionCount.count, 1);

    application.database.exec(
      "UPDATE phases SET deadline = '2000-01-01T00:00:00.000Z' WHERE closed_at IS NULL; UPDATE games SET deadline = '2000-01-01T00:00:00.000Z'",
    );
    assert.equal(application.service.runDuePhases(), 1);
    assert.equal(application.service.runDuePhases(), 0);
    const phaseCount = application.database
      .prepare('SELECT count(*) AS count FROM phases')
      .get() as { count: number };
    assert.equal(phaseCount.count, 3);

    const metricsResponse = await request(application, '/metrics');
    const metrics = await json<Record<string, number>>(metricsResponse);
    assert.equal(metrics.commandsAccepted, 1);
    assert.equal(metrics.transitions, 1);
    assert.doesNotMatch(
      logs.join('\n'),
      /ow_session|command-0001|werewolf|credential/,
    );
  } finally {
    hostSocket?.terminate();
    await stop(application);
  }
});

void test('six clients complete a night, vote, victory, and final reveal', async () => {
  const application = await start();
  let hostSocket: WebSocket | undefined;
  try {
    const host = await createRoom(application);
    hostSocket = await connectMember(application, host);
    const code = host.snapshot.public.roomCode;
    const members: Member[] = [host];
    for (let index = 1; index < 6; index += 1) {
      const response = await request(application, `/rooms/${code}/join`, {
        method: 'POST',
        body: JSON.stringify({ nickname: `Villager ${index}` }),
      });
      assert.equal(response.status, 201);
      members.push({
        cookie: cookie(response),
        snapshot: (await json<{ snapshot: GameSnapshot }>(response)).snapshot,
      });
    }
    for (const member of members) {
      const ready = await request(application, `/rooms/${code}/ready`, {
        method: 'PATCH',
        headers: { cookie: member.cookie },
        body: JSON.stringify({ ready: true }),
      });
      assert.equal(ready.status, 200);
    }
    const started = await request(application, `/rooms/${code}/start`, {
      method: 'POST',
      headers: { cookie: host.cookie },
      body: '{}',
    });
    assert.equal(started.status, 200);

    const assigned = await Promise.all(
      members.map(async (member) => ({
        member,
        snapshot: await getSnapshot(application, code, member),
      })),
    );
    const wolf = assigned.find(
      ({ snapshot }) => snapshot.private.role === 'werewolf',
    );
    const victim = assigned.find(
      ({ snapshot }) => snapshot.private.role !== 'werewolf',
    );
    assert.ok(wolf?.snapshot.private.availableAction);
    assert.ok(victim);
    const nightCommand = await request(application, `/rooms/${code}/commands`, {
      method: 'POST',
      headers: { cookie: wolf.member.cookie },
      body: JSON.stringify({
        commandId: 'full-game-night-action',
        expectedVersion: wolf.snapshot.public.version,
        expectedPhase: 'first-night',
        action: 'wolf-vote',
        targets: [victim.snapshot.private.playerId],
      }),
    });
    assert.equal(nightCommand.status, 200);

    assert.equal(
      (await getSnapshot(application, code, host)).public.phase,
      'dawn',
    );
    for (const expectedPhase of ['discussion', 'voting'] as const) {
      expireOpenPhase(application);
      assert.equal(application.service.runDuePhases(), 1);
      const phaseSnapshot = await getSnapshot(application, code, host);
      assert.equal(phaseSnapshot.public.phase, expectedPhase);
    }

    let voteSequence = 0;
    for (const member of members) {
      const current = await getSnapshot(application, code, member);
      const self = current.public.players.find(
        ({ id }) => id === current.private.playerId,
      );
      if (!self?.alive) continue;
      const target =
        current.private.playerId === wolf.snapshot.private.playerId
          ? current.public.players.find(
              ({ id, alive }) => alive && id !== wolf.snapshot.private.playerId,
            )?.id
          : wolf.snapshot.private.playerId;
      assert.ok(target);
      const voted = await request(application, `/rooms/${code}/commands`, {
        method: 'POST',
        headers: { cookie: member.cookie },
        body: JSON.stringify({
          commandId: `full-game-vote-${voteSequence++}`,
          expectedVersion: current.public.version,
          expectedPhase: 'voting',
          action: 'day-vote',
          targets: [target],
        }),
      });
      assert.equal(voted.status, 200);
    }

    const finalSnapshots = await Promise.all(
      members.map((member) => getSnapshot(application, code, member)),
    );
    assert.equal(
      finalSnapshots.every(
        (snapshot) =>
          snapshot.public.status === 'finished' &&
          snapshot.public.phase === 'finished' &&
          snapshot.public.winner === 'village' &&
          snapshot.finalRoles?.length === 6 &&
          snapshot.finalEvents?.some(
            (event) =>
              event.type === 'elimination' &&
              typeof event.data.cause === 'string',
          ),
      ),
      true,
    );
    assert.deepEqual(
      finalSnapshots.map((snapshot) => snapshot.finalRoles),
      Array.from({ length: 6 }, () => finalSnapshots[0]!.finalRoles),
    );
  } finally {
    hostSocket?.terminate();
    await stop(application);
  }
});

void test('lobby sessions leave cleanly and cannot be reused', async () => {
  const application = await start();
  try {
    const host = await createRoom(application);
    const code = host.snapshot.public.roomCode;
    const joined = await request(application, `/rooms/${code}/join`, {
      method: 'POST',
      body: JSON.stringify({ nickname: 'Guest' }),
    });
    const guestCookie = cookie(joined);
    const left = await request(application, `/rooms/${code}/session`, {
      method: 'DELETE',
      headers: { cookie: guestCookie },
    });
    assert.equal(left.status, 204);
    const staleGuest = await request(application, '/session', {
      headers: { cookie: guestCookie },
    });
    assert.equal(staleGuest.status, 401);
    assert.equal(
      (await getSnapshot(application, code, host)).public.players.length,
      1,
    );
    const reused = await request(application, `/rooms/${code}/join`, {
      method: 'POST',
      body: JSON.stringify({ nickname: 'guest' }),
    });
    assert.equal(reused.status, 201);

    const closed = await request(application, `/rooms/${code}/session`, {
      method: 'DELETE',
      headers: { cookie: host.cookie },
    });
    assert.equal(closed.status, 204);
    const staleHost = await request(application, '/session', {
      headers: { cookie: host.cookie },
    });
    assert.equal(staleHost.status, 401);
  } finally {
    await stop(application);
  }
});

void test('a persisted deadline advances once after a server restart', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'our-werewolf-'));
  const databasePath = join(directory, 'game.sqlite');
  let first: RunningApp | undefined;
  let second: RunningApp | undefined;
  try {
    const startPersisted = async (): Promise<RunningApp> => {
      const database = new DatabaseSync(databasePath);
      const application = createApplication({
        config: config({ databasePath }),
        database,
        startDeadlineRunner: false,
      });
      application.server.listen(0, '127.0.0.1');
      await once(application.server, 'listening');
      const port = (application.server.address() as AddressInfo).port;
      return Object.assign(application, {
        baseUrl: `http://127.0.0.1:${port}`,
      });
    };

    first = await startPersisted();
    const host = await createRoom(first);
    const hostSocket = await connectMember(first, host);
    const code = host.snapshot.public.roomCode;
    const members: Member[] = [host];
    for (let index = 1; index < 6; index += 1) {
      const response = await request(first, `/rooms/${code}/join`, {
        method: 'POST',
        body: JSON.stringify({ nickname: `Restart ${index}` }),
      });
      members.push({
        cookie: cookie(response),
        snapshot: (await json<{ snapshot: GameSnapshot }>(response)).snapshot,
      });
    }
    for (const member of members)
      await request(first, `/rooms/${code}/ready`, {
        method: 'PATCH',
        headers: { cookie: member.cookie },
        body: JSON.stringify({ ready: true }),
      });
    await request(first, `/rooms/${code}/start`, {
      method: 'POST',
      headers: { cookie: host.cookie },
      body: '{}',
    });
    const versionBeforeRestart = (await getSnapshot(first, code, host)).public
      .version;
    expireOpenPhase(first);
    hostSocket.terminate();
    await first.close();
    first.database.close();
    first = undefined;

    second = await startPersisted();
    assert.equal(second.service.runDuePhases(), 1);
    assert.equal(second.service.runDuePhases(), 0);
    const recovered = await getSnapshot(second, code, host);
    assert.equal(recovered.public.phase, 'dawn');
    assert.ok(recovered.public.version > versionBeforeRestart);
  } finally {
    if (first) await stop(first);
    if (second) await stop(second);
    rmSync(directory, { recursive: true, force: true });
  }
});

void test('rate limits only room creation attempts', async () => {
  const application = await start({ createRateLimit: 1 });
  try {
    const first = await createRoom(application, 'First');
    const limited = await request(application, '/rooms', {
      method: 'POST',
      body: JSON.stringify({ nickname: 'Second' }),
    });
    assert.equal(limited.status, 429);
    assert.ok(limited.headers.get('retry-after'));
    const existing = await request(
      application,
      `/rooms/${first.snapshot.public.roomCode}/snapshot`,
      { headers: { cookie: first.cookie } },
    );
    assert.equal(existing.status, 200);
  } finally {
    await stop(application);
  }
});

void test('forwarded rate-limit addresses are trusted only from private peers', async () => {
  const application = await start({ createRateLimit: 1 });
  try {
    const first = await request(application, '/rooms', {
      method: 'POST',
      headers: { 'x-forwarded-for': '198.51.100.1' },
      body: JSON.stringify({ nickname: 'First' }),
    });
    assert.equal(first.status, 201);
    const second = await request(application, '/rooms', {
      method: 'POST',
      headers: { 'x-forwarded-for': '198.51.100.2' },
      body: JSON.stringify({ nickname: 'Second' }),
    });
    assert.equal(second.status, 201);
    const fakeRequest = {
      socket: { remoteAddress: '203.0.113.10' },
      headers: { 'x-forwarded-for': '198.51.100.3' },
    } as unknown as Parameters<typeof clientAddress>[0];
    assert.equal(clientAddress(fakeRequest), '203.0.113.10');
  } finally {
    await stop(application);
  }
});

void test('presence follows authenticated sockets and rotated or expired sessions close them', async () => {
  let now = new Date('2026-01-01T00:00:00.000Z');
  const application = await start({ sessionTtlSeconds: 300 }, [], () => now);
  const sockets: WebSocket[] = [];
  try {
    const host = await createRoom(application);
    assert.equal(host.snapshot.public.players[0]?.connection, 'disconnected');
    const firstSocket = await connectMember(application, host);
    sockets.push(firstSocket);
    assert.equal(
      (await getSnapshot(application, host.snapshot.public.roomCode, host))
        .public.players[0]?.connection,
      'connected',
    );

    const firstClosed = once(firstSocket, 'close');
    const rotated = await request(
      application,
      `/rooms/${host.snapshot.public.roomCode}/reconnect`,
      { method: 'POST', headers: { cookie: host.cookie }, body: '{}' },
    );
    assert.equal(rotated.status, 200);
    const rotatedMember = {
      cookie: cookie(rotated),
      snapshot: (await json<{ snapshot: GameSnapshot }>(rotated)).snapshot,
    };
    const [rotationCode] = (await firstClosed) as [number];
    assert.equal(rotationCode, 4001);
    assert.equal(
      (
        await request(application, '/session', {
          headers: { cookie: host.cookie },
        })
      ).status,
      401,
    );

    const secondSocket = await connectMember(application, rotatedMember);
    sockets.push(secondSocket);
    const expired = once(secondSocket, 'close');
    now = new Date(now.getTime() + 301_000);
    secondSocket.send(JSON.stringify({ type: 'refresh' }));
    const [expiryCode] = (await expired) as [number];
    assert.equal(expiryCode, 4001);
    assert.equal(
      (
        await request(application, '/session', {
          headers: { cookie: rotatedMember.cookie },
        })
      ).status,
      401,
    );
  } finally {
    for (const socket of sockets) socket.terminate();
    await stop(application);
  }
});

void test('expired rooms are closed and rejected by join and authentication', async () => {
  const application = await start();
  try {
    const host = await createRoom(application);
    const code = host.snapshot.public.roomCode;
    application.database
      .prepare(
        "UPDATE rooms SET expires_at = '2000-01-01T00:00:00.000Z' WHERE code = ?",
      )
      .run(code);
    assert.equal(
      (
        await request(application, '/session', {
          headers: { cookie: host.cookie },
        })
      ).status,
      401,
    );
    const join = await request(application, `/rooms/${code}/join`, {
      method: 'POST',
      body: JSON.stringify({ nickname: 'Late' }),
    });
    assert.equal(join.status, 404);
    const room = application.database
      .prepare('SELECT closed_at FROM rooms WHERE code = ?')
      .get(code) as { closed_at: string | null };
    assert.ok(room.closed_at);
  } finally {
    await stop(application);
  }
});

void test('participant invalidation closes that participant socket', async () => {
  const application = await start();
  let guestSocket: WebSocket | undefined;
  try {
    const host = await createRoom(application);
    const code = host.snapshot.public.roomCode;
    const joined = await request(application, `/rooms/${code}/join`, {
      method: 'POST',
      body: JSON.stringify({ nickname: 'Removed guest' }),
    });
    const guest = {
      cookie: cookie(joined),
      snapshot: (await json<{ snapshot: GameSnapshot }>(joined)).snapshot,
    };
    guestSocket = await connectMember(application, guest);
    const closed = once(guestSocket, 'close');
    const removed = await request(
      application,
      `/rooms/${code}/participants/${guest.snapshot.private.playerId}`,
      { method: 'DELETE', headers: { cookie: host.cookie } },
    );
    assert.equal(removed.status, 200);
    const [closeCode] = (await closed) as [number];
    assert.equal(closeCode, 4001);
    assert.equal(
      (
        await request(application, '/session', {
          headers: { cookie: guest.cookie },
        })
      ).status,
      401,
    );
  } finally {
    guestSocket?.terminate();
    await stop(application);
  }
});

void test('websockets authenticate by cookie and keep broadcasts room-isolated', async () => {
  const application = await start();
  const sockets: WebSocket[] = [];
  try {
    const roomA = await createRoom(application, 'A');
    const roomB = await createRoom(application, 'B');
    const connect = async (room: typeof roomA) => {
      const socket = new WebSocket(
        `${application.baseUrl.replace('http', 'ws')}/ws?room=${room.snapshot.public.roomCode}`,
        {
          headers: { cookie: room.cookie, origin },
        },
      );
      sockets.push(socket);
      const messages: string[] = [];
      socket.on('message', (data: RawData) => messages.push(wsText(data)));
      await once(socket, 'open');
      await new Promise((resolve) => setTimeout(resolve, 30));
      return { socket, messages };
    };
    const a = await connect(roomA);
    const b = await connect(roomB);
    assert.ok(
      a.messages.some((message) =>
        message.includes(roomA.snapshot.public.roomCode),
      ),
    );
    assert.ok(
      b.messages.some((message) =>
        message.includes(roomB.snapshot.public.roomCode),
      ),
    );

    a.messages.length = 0;
    b.messages.length = 0;
    const ready = await request(
      application,
      `/rooms/${roomA.snapshot.public.roomCode}/ready`,
      {
        method: 'PATCH',
        headers: { cookie: roomA.cookie },
        body: JSON.stringify({ ready: true }),
      },
    );
    assert.equal(ready.status, 200);
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.ok(
      a.messages.some((message) =>
        message.includes(roomA.snapshot.public.roomCode),
      ),
    );
    assert.equal(
      b.messages.some((message) =>
        message.includes(roomA.snapshot.public.roomCode),
      ),
      false,
    );

    const unauthorized = new WebSocket(
      `${application.baseUrl.replace('http', 'ws')}/ws?room=${roomA.snapshot.public.roomCode}`,
      { headers: { origin } },
    );
    const status = await new Promise<number>((resolve, reject) => {
      unauthorized.once('unexpected-response', (request, response) => {
        void request;
        resolve(response.statusCode ?? 0);
        response.destroy();
      });
      unauthorized.once('error', reject);
    });
    assert.equal(status, 401);
  } finally {
    for (const socket of sockets) socket.terminate();
    await stop(application);
  }
});

function wsText(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return data.toString('utf8');
}
