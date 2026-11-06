export const hiddenRolesMigration = {
  id: '003_hidden_roles',
  up: `
    ALTER TABLE rooms ADD COLUMN hide_special_roles INTEGER NOT NULL DEFAULT 0
      CHECK (hide_special_roles IN (0, 1));
  `,
  down: `
    ALTER TABLE rooms DROP COLUMN hide_special_roles;
  `,
} as const;
