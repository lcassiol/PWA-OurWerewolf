export const backendCorrectionsMigration = {
  id: '002_backend_corrections',
  disableForeignKeys: true,
  up: `
    ALTER TABLE participants RENAME TO participants_legacy;

    CREATE TABLE participants (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      nickname TEXT NOT NULL CHECK (length(nickname) BETWEEN 1 AND 24),
      nickname_normalized TEXT NOT NULL,
      is_host INTEGER NOT NULL DEFAULT 0 CHECK (is_host IN (0, 1)),
      ready INTEGER NOT NULL DEFAULT 0 CHECK (ready IN (0, 1)),
      connected INTEGER NOT NULL DEFAULT 0 CHECK (connected IN (0, 1)),
      session_hash TEXT UNIQUE,
      session_expires_at TEXT,
      joined_at TEXT NOT NULL,
      removed_at TEXT
    ) STRICT;
    INSERT INTO participants SELECT * FROM participants_legacy;
    DROP TABLE participants_legacy;
    CREATE UNIQUE INDEX participants_active_nickname
      ON participants(room_id, nickname_normalized) WHERE removed_at IS NULL;
    CREATE UNIQUE INDEX participants_one_host
      ON participants(room_id) WHERE is_host = 1 AND removed_at IS NULL;
    CREATE INDEX participants_session_hash
      ON participants(session_hash) WHERE session_hash IS NOT NULL;

    ALTER TABLE phases ADD COLUMN stage TEXT NOT NULL DEFAULT 'main';
    ALTER TABLE phases ADD COLUMN resume_phase TEXT;
  `,
  down: `
    ALTER TABLE phases DROP COLUMN resume_phase;
    ALTER TABLE phases DROP COLUMN stage;

    ALTER TABLE participants RENAME TO participants_corrected;
    CREATE TABLE participants (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
      nickname TEXT NOT NULL CHECK (length(nickname) BETWEEN 1 AND 24),
      nickname_normalized TEXT NOT NULL,
      is_host INTEGER NOT NULL DEFAULT 0 CHECK (is_host IN (0, 1)),
      ready INTEGER NOT NULL DEFAULT 0 CHECK (ready IN (0, 1)),
      connected INTEGER NOT NULL DEFAULT 0 CHECK (connected IN (0, 1)),
      session_hash TEXT UNIQUE,
      session_expires_at TEXT,
      joined_at TEXT NOT NULL,
      removed_at TEXT,
      UNIQUE (room_id, nickname_normalized)
    ) STRICT;
    INSERT INTO participants (
      id, room_id, nickname, nickname_normalized, is_host, ready, connected,
      session_hash, session_expires_at, joined_at, removed_at
    )
    SELECT
      id,
      room_id,
      nickname,
      CASE
        WHEN removed_at IS NOT NULL
          THEN nickname_normalized || '#removed-' || id
        ELSE nickname_normalized
      END,
      is_host,
      ready,
      connected,
      session_hash,
      session_expires_at,
      joined_at,
      removed_at
    FROM participants_corrected;
    DROP TABLE participants_corrected;
    CREATE UNIQUE INDEX participants_one_host
      ON participants(room_id) WHERE is_host = 1 AND removed_at IS NULL;
    CREATE INDEX participants_session_hash
      ON participants(session_hash) WHERE session_hash IS NOT NULL;
  `,
} as const;
