import { describe, expect, it } from 'vitest';
import type { GameSnapshot } from './index.js';
import { avatarIds, parseRoomSettings } from './index.js';

describe('shared contracts', () => {
  it('offers ten distinct participant avatars', () => {
    expect(avatarIds).toHaveLength(10);
    expect(new Set(avatarIds).size).toBe(10);
  });

  it('validates and deduplicates room settings', () => {
    expect(
      parseRoomSettings({
        discussionMinutes: 5,
        allowNoExile: true,
        hideSpecialRoles: false,
        showFinalTimeline: true,
        specialRoles: ['seer', 'seer', 'witch'],
      }),
    ).toEqual({
      discussionMinutes: 5,
      allowNoExile: true,
      hideSpecialRoles: false,
      showFinalTimeline: true,
      specialRoles: ['seer', 'witch'],
    });
    expect(() => parseRoomSettings({ discussionMinutes: 0 })).toThrow();
  });

  it('keeps snapshots JSON safe', () => {
    const snapshot: GameSnapshot = {
      public: {
        roomCode: 'WOLF',
        status: 'lobby',
        version: 1,
        round: 0,
        phase: 'lobby',
        deadline: null,
        players: [],
        settings: {
          discussionMinutes: 5,
          allowNoExile: true,
          hideSpecialRoles: false,
          showFinalTimeline: true,
          specialRoles: [],
        },
        discussionReadiness: null,
        announcements: [],
        winner: null,
      },
      private: {
        playerId: 'p1',
        role: null,
        alignment: null,
        objective: null,
        knownPlayers: [],
        resources: {},
        availableAction: null,
        readyForVote: false,
        personalWinner: false,
      },
      host: null,
    };
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });
});
