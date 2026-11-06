export const participantAvatarsMigration = {
  id: '005_participant_avatars',
  up: `
    ALTER TABLE participants ADD COLUMN avatar_id TEXT NOT NULL DEFAULT 'moon'
      CHECK (avatar_id IN ('moon', 'owl', 'fox', 'stag', 'raven', 'cat', 'bat', 'bear', 'rabbit', 'boar'));

    WITH ranked AS (
      SELECT
        id,
        (row_number() OVER (PARTITION BY room_id ORDER BY joined_at, id) - 1) % 10 AS avatar_index
      FROM participants
    )
    UPDATE participants
    SET avatar_id = CASE (SELECT avatar_index FROM ranked WHERE ranked.id = participants.id)
      WHEN 0 THEN 'moon'
      WHEN 1 THEN 'owl'
      WHEN 2 THEN 'fox'
      WHEN 3 THEN 'stag'
      WHEN 4 THEN 'raven'
      WHEN 5 THEN 'cat'
      WHEN 6 THEN 'bat'
      WHEN 7 THEN 'bear'
      WHEN 8 THEN 'rabbit'
      ELSE 'boar'
    END;
  `,
  down: `
    ALTER TABLE participants DROP COLUMN avatar_id;
  `,
} as const;
