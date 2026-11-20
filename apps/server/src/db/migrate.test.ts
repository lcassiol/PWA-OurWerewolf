import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { migrateDown, migrateUp } from './migrate.js';
import { initialMigration } from './migrations/001_initial.js';

void test('migration applies constraints and rolls back cleanly', () => {
  const database = new DatabaseSync(':memory:');
  try {
    migrateUp(database);
    const insert = database.prepare(`INSERT INTO rooms
      (id, code, created_at, expires_at) VALUES (?, ?, ?, ?)`);
    insert.run(
      'room-1',
      'ABCD',
      new Date(0).toISOString(),
      new Date(1).toISOString(),
    );
    assert.throws(
      () =>
        insert.run(
          'room-2',
          'ABCD',
          new Date(0).toISOString(),
          new Date(1).toISOString(),
        ),
      /UNIQUE constraint failed/,
    );
    assert.throws(
      () =>
        database
          .prepare(
            `INSERT INTO rooms (id, code, status, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`,
          )
          .run(
            'room-3',
            'EFGH',
            'invalid',
            new Date(0).toISOString(),
            new Date(1).toISOString(),
          ),
      /CHECK constraint failed/,
    );

    migrateDown(database, 9);
    const tables = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name != 'schema_migrations'",
      )
      .all();
    assert.deepEqual(tables, []);
  } finally {
    database.close();
  }
});

void test('migration runner is idempotent', () => {
  const database = new DatabaseSync(':memory:');
  try {
    migrateUp(database);
    migrateUp(database);
    const applied = database
      .prepare('SELECT count(*) AS count FROM schema_migrations')
      .get() as { count: number };
    assert.equal(applied.count, 9);
  } finally {
    database.close();
  }
});

void test('removed participants release nicknames while active nicknames stay unique', () => {
  const database = new DatabaseSync(':memory:');
  try {
    migrateUp(database);
    database
      .prepare(
        'INSERT INTO rooms (id, code, created_at, expires_at) VALUES (?, ?, ?, ?)',
      )
      .run(
        'room',
        'TEST',
        new Date(0).toISOString(),
        new Date(1).toISOString(),
      );
    const insert = database.prepare(
      `INSERT INTO participants
        (id, room_id, nickname, nickname_normalized, joined_at, removed_at)
       VALUES (?, 'room', ?, 'same', ?, ?)`,
    );
    insert.run(
      'removed',
      'Same',
      new Date(0).toISOString(),
      new Date(0).toISOString(),
    );
    insert.run('active', 'same', new Date(1).toISOString(), null);
    assert.throws(
      () => insert.run('duplicate', 'SAME', new Date(2).toISOString(), null),
      /UNIQUE constraint failed/,
    );
    migrateDown(database, 8);
    const restored = database
      .prepare('SELECT id, nickname_normalized FROM participants ORDER BY id')
      .all() as Array<{ id: string; nickname_normalized: string }>;
    assert.equal(restored.length, 2);
    assert.equal(
      new Set(restored.map((row) => row.nickname_normalized)).size,
      2,
    );
  } finally {
    database.close();
  }
});

void test('nickname migration preserves existing games and supports down migration', () => {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec(
      `PRAGMA foreign_keys = ON;
       CREATE TABLE schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL) STRICT;
       ${initialMigration.up}`,
    );
    database
      .prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)')
      .run(initialMigration.id, new Date(0).toISOString());
    database
      .prepare(
        'INSERT INTO rooms (id, code, created_at, expires_at) VALUES (?, ?, ?, ?)',
      )
      .run(
        'room',
        'KEEP',
        new Date(0).toISOString(),
        new Date(1).toISOString(),
      );
    database
      .prepare(
        `INSERT INTO participants
          (id, room_id, nickname, nickname_normalized, joined_at)
         VALUES ('player', 'room', 'Player', 'player', ?)`,
      )
      .run(new Date(0).toISOString());
    database
      .prepare(
        `INSERT INTO games
          (id, room_id, status, frozen_settings_json, phase, started_at)
         VALUES ('game', 'room', 'active', '{}', 'night', ?)`,
      )
      .run(new Date(0).toISOString());
    database
      .prepare(
        `INSERT INTO assignments
          (id, game_id, participant_id, role, alignment)
         VALUES ('assignment', 'game', 'player', 'villager', 'village')`,
      )
      .run();

    migrateUp(database);
    assert.equal(
      (
        database
          .prepare("SELECT avatar_id FROM participants WHERE id = 'player'")
          .get() as { avatar_id: string }
      ).avatar_id,
      'moon',
    );
    assert.equal(
      (
        database
          .prepare("SELECT theme_id FROM rooms WHERE id = 'room'")
          .get() as {
          theme_id: string;
        }
      ).theme_id,
      'autumn-legend',
    );
    assert.ok(
      database
        .prepare("SELECT 1 FROM assignments WHERE id = 'assignment'")
        .get(),
    );
    assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
    migrateDown(database, 7);
    assert.ok(
      database
        .prepare("SELECT 1 FROM assignments WHERE id = 'assignment'")
        .get(),
    );
    assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    database.close();
  }
});

void test('afterlife migration enforces constraints and rolls back cleanly', () => {
  const database = new DatabaseSync(':memory:');
  try {
    migrateUp(database);
    database.exec(`
      INSERT INTO rooms (id, code, created_at, expires_at)
        VALUES ('room-afterlife', 'SOUL', '2026-01-01', '2027-01-01');
      INSERT INTO participants
        (id, room_id, nickname, nickname_normalized, joined_at)
        VALUES ('dead', 'room-afterlife', 'Dead', 'dead', '2026-01-01');
      INSERT INTO games
        (id, room_id, status, frozen_settings_json, phase, started_at)
        VALUES ('game-afterlife', 'room-afterlife', 'active', '{}', 'dawn', '2026-01-01');
      INSERT INTO afterlife_rounds
        (id, game_id, round, opened_at)
        VALUES ('round-afterlife', 'game-afterlife', 1, '2026-01-01');
    `);
    assert.throws(
      () =>
        database
          .prepare(
            `INSERT INTO afterlife_entries
              (round_id, participant_id, team, wager)
             VALUES ('round-afterlife', 'dead', 'village', 4)`,
          )
          .run(),
      /CHECK constraint failed/,
    );
    database
      .prepare(
        `INSERT INTO afterlife_ledger
          (id, game_id, participant_id, reason, event_key, amount, created_at)
         VALUES (?, 'game-afterlife', 'dead', 'initial', 'initial', 10, '2026-01-01')`,
      )
      .run('ledger-1');
    assert.throws(
      () =>
        database
          .prepare(
            `INSERT INTO afterlife_ledger
              (id, game_id, participant_id, reason, event_key, amount, created_at)
             VALUES (?, 'game-afterlife', 'dead', 'initial', 'initial', 10, '2026-01-01')`,
          )
          .run('ledger-2'),
      /UNIQUE constraint failed/,
    );
    assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);

    migrateDown(database, 2);
    const afterlifeTables = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'afterlife_%'",
      )
      .all();
    assert.deepEqual(afterlifeTables, []);
    assert.ok(
      database.prepare("SELECT 1 FROM games WHERE id = 'game-afterlife'").get(),
    );
  } finally {
    database.close();
  }
});

void test('Necromancer migration preserves assignments and downgrades the role safely', () => {
  const database = new DatabaseSync(':memory:');
  try {
    migrateUp(database);
    database.exec(`
      INSERT INTO rooms (id, code, created_at, expires_at)
        VALUES ('room-necromancer', 'NECR', '2026-01-01', '2027-01-01');
      INSERT INTO participants
        (id, room_id, nickname, nickname_normalized, joined_at)
        VALUES ('necromancer', 'room-necromancer', 'Nina', 'nina', '2026-01-01');
      INSERT INTO games
        (id, room_id, status, frozen_settings_json, phase, started_at)
        VALUES ('game-necromancer', 'room-necromancer', 'active', '{}', 'night', '2026-01-01');
      INSERT INTO assignments
        (id, game_id, participant_id, role, alignment)
        VALUES ('assignment-necromancer', 'game-necromancer', 'necromancer', 'necromancer', 'village');
    `);
    assert.equal(
      (
        database
          .prepare(
            "SELECT role FROM assignments WHERE id = 'assignment-necromancer'",
          )
          .get() as { role: string }
      ).role,
      'necromancer',
    );

    migrateDown(database, 1);

    assert.equal(
      (
        database
          .prepare(
            "SELECT role FROM assignments WHERE id = 'assignment-necromancer'",
          )
          .get() as { role: string }
      ).role,
      'villager',
    );
    assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    database.close();
  }
});
