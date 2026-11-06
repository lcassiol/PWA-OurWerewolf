export const finalTimelineMigration = {
  id: '004_final_timeline',
  up: `
    ALTER TABLE rooms ADD COLUMN show_final_timeline INTEGER NOT NULL DEFAULT 1
      CHECK (show_final_timeline IN (0, 1));
  `,
  down: `
    ALTER TABLE rooms DROP COLUMN show_final_timeline;
  `,
} as const;
