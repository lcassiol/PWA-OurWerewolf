import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  dawnDeathAnnouncement,
  dawnDeathTemplates,
  dawnNoDeathAnnouncement,
  dawnNoDeathMessages,
} from './dawn-announcements.js';

void test('offers at least sixty comic dawn announcements', () => {
  assert.ok(dawnDeathTemplates.length >= 45);
  assert.ok(dawnNoDeathMessages.length >= 15);
  assert.ok(dawnDeathTemplates.length + dawnNoDeathMessages.length >= 60);
  assert.ok(dawnDeathTemplates.every((message) => message.includes('{name}')));
});

void test('selects stable but varied announcements from the seed', () => {
  assert.equal(
    dawnDeathAnnouncement('Bento', 'game-1:event-1'),
    dawnDeathAnnouncement('Bento', 'game-1:event-1'),
  );
  assert.match(dawnDeathAnnouncement('Bento', 'game-1:event-1'), /Bento/);

  const deathMessages = new Set(
    Array.from({ length: 100 }, (_, index) =>
      dawnDeathAnnouncement('Bento', `game-${index}:event-${index}`),
    ),
  );
  const noDeathMessages = new Set(
    Array.from({ length: 100 }, (_, index) =>
      dawnNoDeathAnnouncement(`game-${index}:night-${index}`),
    ),
  );
  assert.ok(deathMessages.size > 20);
  assert.ok(noDeathMessages.size > 10);
});
