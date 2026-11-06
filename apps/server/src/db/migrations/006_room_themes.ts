export const roomThemesMigration = {
  id: '006_room_themes',
  up: `
    ALTER TABLE rooms ADD COLUMN theme_id TEXT NOT NULL DEFAULT 'autumn-legend'
      CHECK (theme_id IN ('blue-moon', 'cursed-forest', 'blood-moon', 'spirit-veil', 'autumn-legend'));
  `,
  down: `
    ALTER TABLE rooms DROP COLUMN theme_id;
  `,
} as const;
