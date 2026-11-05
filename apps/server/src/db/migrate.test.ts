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

    migrateDown(database, 2);
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
    assert.equal(applied.count, 2);
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
    migrateDown(database, 1);
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
    assert.ok(
      database
        .prepare("SELECT 1 FROM assignments WHERE id = 'assignment'")
        .get(),
    );
    assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
    migrateDown(database, 1);
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
