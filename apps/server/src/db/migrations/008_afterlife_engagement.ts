export const afterlifeEngagementMigration = {
  id: '008_afterlife_engagement',
  up: `
    CREATE TABLE afterlife_rounds (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      round INTEGER NOT NULL CHECK (round >= 1),
      opened_at TEXT NOT NULL,
      closed_at TEXT,
      exile_target_id TEXT REFERENCES participants(id) ON DELETE SET NULL,
      settled_at TEXT,
      UNIQUE (game_id, round)
    ) STRICT;

    CREATE TABLE afterlife_entries (
      round_id TEXT NOT NULL REFERENCES afterlife_rounds(id) ON DELETE CASCADE,
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,
      exile_target_id TEXT REFERENCES participants(id) ON DELETE SET NULL,
      werewolf_targets_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(werewolf_targets_json)),
      team TEXT CHECK (team IS NULL OR team IN ('village', 'werewolves', 'lovers')),
      wager INTEGER CHECK (wager IS NULL OR wager BETWEEN 1 AND 3),
      submitted_at TEXT,
      PRIMARY KEY (round_id, participant_id),
      CHECK ((team IS NULL AND wager IS NULL) OR (team IS NOT NULL AND wager IS NOT NULL))
    ) STRICT;

    CREATE TABLE afterlife_messages (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,
      text TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 500),
      created_at TEXT NOT NULL
    ) STRICT;
    CREATE INDEX afterlife_messages_timeline
      ON afterlife_messages(game_id, created_at, id);

    CREATE TABLE afterlife_ledger (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,
      round INTEGER CHECK (round IS NULL OR round >= 1),
      reason TEXT NOT NULL CHECK (reason IN ('initial', 'exile-prediction', 'werewolf-mark', 'team-wager')),
      event_key TEXT NOT NULL,
      amount INTEGER NOT NULL,
      data_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(data_json)),
      created_at TEXT NOT NULL,
      UNIQUE (game_id, participant_id, event_key)
    ) STRICT;
    CREATE INDEX afterlife_ledger_balance
      ON afterlife_ledger(game_id, participant_id);
  `,
  down: `
    DROP TABLE IF EXISTS afterlife_ledger;
    DROP TABLE IF EXISTS afterlife_messages;
    DROP TABLE IF EXISTS afterlife_entries;
    DROP TABLE IF EXISTS afterlife_rounds;
  `,
} as const;
