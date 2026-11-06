import type { DatabaseSync } from 'node:sqlite';
import { loadConfig } from '../env.js';
import { initialMigration } from './migrations/001_initial.js';
import { backendCorrectionsMigration } from './migrations/002_backend_corrections.js';
import { hiddenRolesMigration } from './migrations/003_hidden_roles.js';
import { finalTimelineMigration } from './migrations/004_final_timeline.js';
import { participantAvatarsMigration } from './migrations/005_participant_avatars.js';
import { openDatabase } from './open.js';

const migrations = [
  initialMigration,
  backendCorrectionsMigration,
  hiddenRolesMigration,
  finalTimelineMigration,
  participantAvatarsMigration,
] as const;

type Migration = (typeof migrations)[number];

function applyMigration(
  database: DatabaseSync,
  migration: Migration,
  sql: string,
  after: () => void,
): void {
  const disableForeignKeys =
    'disableForeignKeys' in migration && migration.disableForeignKeys;
  if (disableForeignKeys) {
    database.exec('PRAGMA foreign_keys = OFF; PRAGMA legacy_alter_table = ON;');
  }
  database.exec('BEGIN IMMEDIATE');
  try {
    database.exec(sql);
    if (disableForeignKeys) {
      const violations = database.prepare('PRAGMA foreign_key_check').all();
      if (violations.length > 0)
        throw new Error('Migration broke foreign keys');
    }
    after();
    database.exec('COMMIT');
  } catch (error) {
    if (database.isTransaction) database.exec('ROLLBACK');
    throw error;
  } finally {
    if (disableForeignKeys) {
      database.exec(
        'PRAGMA legacy_alter_table = OFF; PRAGMA foreign_keys = ON;',
      );
    }
  }
}

export function migrateUp(database: DatabaseSync): void {
  database.exec(
    'PRAGMA foreign_keys = ON; CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL) STRICT;',
  );
  const applied = database.prepare(
    'SELECT 1 FROM schema_migrations WHERE id = ?',
  );
  const record = database.prepare(
    'INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)',
  );
  for (const migration of migrations) {
    if (applied.get(migration.id)) continue;
    applyMigration(database, migration, migration.up, () => {
      record.run(migration.id, new Date().toISOString());
    });
  }
}

export function migrateDown(database: DatabaseSync, count = 1): void {
  database.exec(
    'PRAGMA foreign_keys = ON; CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL) STRICT;',
  );
  const remove = database.prepare('DELETE FROM schema_migrations WHERE id = ?');
  const applied = database.prepare(
    'SELECT 1 FROM schema_migrations WHERE id = ?',
  );
  let remaining = count;
  for (const migration of [...migrations].reverse()) {
    if (remaining === 0) break;
    if (!applied.get(migration.id)) continue;
    applyMigration(database, migration, migration.down, () => {
      remove.run(migration.id);
    });
    remaining -= 1;
  }
}

function main(): void {
  const config = loadConfig();
  const database = openDatabase(config.databasePath);
  try {
    if (process.argv[2] === 'down')
      migrateDown(database, Number(process.argv[3] ?? 1));
    else migrateUp(database);
  } finally {
    database.close();
  }
}

if (import.meta.url === new URL(process.argv[1] ?? '', 'file:').href) main();
