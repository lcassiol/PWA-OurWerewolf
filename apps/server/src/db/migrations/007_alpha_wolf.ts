export const alphaWolfMigration = {
  id: '007_alpha_wolf',
  disableForeignKeys: true,
  up: `
    ALTER TABLE assignments RENAME TO assignments_without_alpha_wolf;
    CREATE TABLE assignments (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,
      role TEXT NOT NULL CHECK (role IN ('werewolf','alpha-wolf','villager','hunter','seer','witch','doctor','fool','cupid','guardian','mayor','little-girl')),
      alignment TEXT NOT NULL CHECK (alignment IN ('werewolves', 'village', 'neutral')),
      alive INTEGER NOT NULL DEFAULT 1 CHECK (alive IN (0, 1)),
      resources_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(resources_json)),
      UNIQUE (game_id, participant_id)
    ) STRICT;
    INSERT INTO assignments SELECT * FROM assignments_without_alpha_wolf;
    DROP TABLE assignments_without_alpha_wolf;
  `,
  down: `
    ALTER TABLE assignments RENAME TO assignments_with_alpha_wolf;
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
    INSERT INTO assignments
      SELECT id, game_id, participant_id,
        CASE role WHEN 'alpha-wolf' THEN 'werewolf' ELSE role END,
        alignment, alive, resources_json
      FROM assignments_with_alpha_wolf;
    DROP TABLE assignments_with_alpha_wolf;
  `,
} as const;
