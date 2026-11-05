export const initialMigration = {
  id: '001_initial',
  up: `
    CREATE TABLE rooms (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'lobby' CHECK (status IN ('lobby', 'playing', 'finished')),
      discussion_minutes INTEGER NOT NULL DEFAULT 5 CHECK (discussion_minutes BETWEEN 1 AND 15),
      allow_no_exile INTEGER NOT NULL DEFAULT 1 CHECK (allow_no_exile IN (0, 1)),
      special_roles_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(special_roles_json)),
      version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      closed_at TEXT
    ) STRICT;
    CREATE UNIQUE INDEX rooms_active_code ON rooms(code) WHERE closed_at IS NULL;

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
    CREATE UNIQUE INDEX participants_one_host ON participants(room_id) WHERE is_host = 1 AND removed_at IS NULL;
    CREATE INDEX participants_session_hash ON participants(session_hash) WHERE session_hash IS NOT NULL;

    CREATE TABLE games (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL UNIQUE REFERENCES rooms(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('active', 'finished')),
      frozen_settings_json TEXT NOT NULL CHECK (json_valid(frozen_settings_json)),
      version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
      phase TEXT NOT NULL CHECK (phase IN ('first-night', 'night', 'dawn', 'discussion', 'voting', 'day-resolution', 'hunter-shot', 'finished')),
      round INTEGER NOT NULL DEFAULT 1 CHECK (round >= 1),
      deadline TEXT,
      winner TEXT CHECK (winner IS NULL OR winner IN ('village', 'werewolves', 'lovers')),
      started_at TEXT NOT NULL,
      finished_at TEXT
    ) STRICT;

    CREATE TABLE phases (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      sequence INTEGER NOT NULL CHECK (sequence >= 1),
      kind TEXT NOT NULL CHECK (kind IN ('first-night', 'night', 'dawn', 'discussion', 'voting', 'day-resolution', 'hunter-shot', 'finished')),
      round INTEGER NOT NULL CHECK (round >= 1),
      opened_at TEXT NOT NULL,
      deadline TEXT,
      closed_at TEXT,
      close_reason TEXT CHECK (close_reason IS NULL OR close_reason IN ('deadline', 'complete', 'game-finished')),
      UNIQUE (game_id, sequence)
    ) STRICT;
    CREATE UNIQUE INDEX phases_one_open ON phases(game_id) WHERE closed_at IS NULL;
    CREATE INDEX phases_due ON phases(deadline) WHERE closed_at IS NULL AND deadline IS NOT NULL;

    CREATE TABLE assignments (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,
      role TEXT NOT NULL CHECK (role IN ('werewolf','villager','hunter','seer','witch','doctor','fool','cupid','guardian','mayor','little-girl')),
      alignment TEXT NOT NULL CHECK (alignment IN ('werewolves', 'village', 'neutral')),
      alive INTEGER NOT NULL DEFAULT 1 CHECK (alive IN (0, 1)),
      resources_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(resources_json)),
      UNIQUE (game_id, participant_id)
    ) STRICT;

    CREATE TABLE actions (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      phase_id TEXT NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,
      action_type TEXT NOT NULL,
      targets_json TEXT NOT NULL CHECK (json_valid(targets_json)),
      submitted_at TEXT NOT NULL,
      UNIQUE (phase_id, participant_id, action_type)
    ) STRICT;

    CREATE TABLE effects (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      phase_id TEXT REFERENCES phases(id) ON DELETE SET NULL,
      sequence INTEGER NOT NULL CHECK (sequence >= 1),
      effect_type TEXT NOT NULL,
      visibility TEXT NOT NULL CHECK (visibility IN ('public', 'private', 'final')),
      visible_to_participant_id TEXT REFERENCES participants(id) ON DELETE SET NULL,
      data_json TEXT NOT NULL CHECK (json_valid(data_json)),
      created_at TEXT NOT NULL,
      UNIQUE (game_id, sequence)
    ) STRICT;

    CREATE TABLE winners (
      game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,
      kind TEXT NOT NULL CHECK (kind IN ('main', 'personal')),
      reason TEXT NOT NULL,
      PRIMARY KEY (game_id, participant_id, kind)
    ) STRICT;

    CREATE TABLE idempotency (
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      command_id TEXT NOT NULL,
      game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      response_status INTEGER NOT NULL,
      response_json TEXT NOT NULL CHECK (json_valid(response_json)),
      created_at TEXT NOT NULL,
      PRIMARY KEY (participant_id, command_id)
    ) STRICT;
  `,
  down: `
    DROP TABLE IF EXISTS idempotency;
    DROP TABLE IF EXISTS winners;
    DROP TABLE IF EXISTS effects;
    DROP TABLE IF EXISTS actions;
    DROP TABLE IF EXISTS assignments;
    DROP TABLE IF EXISTS phases;
    DROP TABLE IF EXISTS games;
    DROP TABLE IF EXISTS participants;
    DROP TABLE IF EXISTS rooms;
  `,
} as const;
