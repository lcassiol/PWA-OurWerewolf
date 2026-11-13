import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type {
  AvatarId,
  AvailableAction,
  GameActionType,
  GameCommand,
  GamePhase,
  GameSnapshot,
  KnowledgeFact,
  RoleArtworkSetId,
  RoleId,
  RoomSettings,
  ThemeId,
} from './contracts.js';
import { avatarIds, knowledgeFacts, themeIds } from './contracts.js';
import type { DomainAdapter } from './domain-adapter.js';
import {
  fromWitchResources,
  initialResources,
  objective,
  toWitchResources,
  type DomainPlayer,
  type LoverBond,
  type VictoryResult,
  type WitchAction,
} from './domain-adapter.js';
import {
  dawnDeathAnnouncement,
  dawnNoDeathAnnouncement,
} from './dawn-announcements.js';
import { assert, HttpError } from './errors.js';
import type { Logger } from './logger.js';

type RoomRow = {
  id: string;
  code: string;
  status: 'lobby' | 'playing' | 'finished';
  discussion_minutes: number;
  allow_no_exile: number;
  hide_special_roles: number;
  show_final_timeline: number;
  special_roles_json: string;
  version: number;
  theme_id: ThemeId;
  expires_at: string;
};

type ParticipantRow = {
  id: string;
  room_id: string;
  nickname: string;
  nickname_normalized: string;
  avatar_id: AvatarId;
  is_host: number;
  ready: number;
  connected: number;
  removed_at: string | null;
};

type GameRow = {
  id: string;
  room_id: string;
  status: 'active' | 'finished';
  frozen_settings_json: string;
  version: number;
  phase: GamePhase;
  round: number;
  deadline: string | null;
  winner: 'village' | 'werewolves' | 'lovers' | null;
};

type PhaseRow = {
  id: string;
  game_id: string;
  sequence: number;
  kind: GamePhase;
  round: number;
  deadline: string | null;
  closed_at: string | null;
  stage: NightStage | 'main';
  resume_phase: GamePhase | null;
};

type AssignmentRow = {
  participant_id: string;
  role: RoleId;
  alignment: 'werewolves' | 'village' | 'neutral';
  alive: number;
  resources_json: string;
};

type ActionRow = {
  participant_id: string;
  action_type: GameActionType;
  targets_json: string;
};

export type Identity = {
  participantId: string;
  roomId: string;
  roomCode: string;
  isHost: boolean;
  sessionHash: string;
};

type NightStage = 'cupid' | 'pack' | 'night-actions';

export type ServiceMetrics = {
  commandsAccepted: number;
  commandsRejected: number;
  transitions: number;
};

export type ServiceOptions = {
  database: DatabaseSync;
  domain: DomainAdapter;
  logger: Logger;
  sessionSecret: string;
  sessionTtlSeconds: number;
  now?: () => Date;
  generateCode?: () => string;
  generateTheme?: () => ThemeId;
};

const actionByRole: Partial<Record<RoleId, GameActionType>> = {
  werewolf: 'wolf-vote',
  'alpha-wolf': 'wolf-vote',
  seer: 'seer-inspect',
  witch: 'witch-heal',
  doctor: 'doctor-protect',
  hunter: 'hunter-shoot',
  cupid: 'cupid-link',
  guardian: 'guardian-protect',
  'little-girl': 'little-girl-spy',
};

const roleIds = new Set<RoleId>([
  'werewolf',
  'alpha-wolf',
  'villager',
  'hunter',
  'seer',
  'witch',
  'doctor',
  'fool',
  'cupid',
  'guardian',
  'mayor',
  'little-girl',
]);

function isWerewolfRole(role: RoleId): boolean {
  return role === 'werewolf' || role === 'alpha-wolf';
}

export function roleArtworkSetForGame(gameId: string): RoleArtworkSetId {
  const randomNibble = Number.parseInt(gameId.at(-1) ?? '0', 16);
  return Number.isNaN(randomNibble) || randomNibble % 2 === 0
    ? 'cartoon'
    : 'realistic';
}

function parseSettings(value: unknown): RoomSettings {
  if (!value || typeof value !== 'object') throw new Error('Invalid settings');
  const candidate = value as Record<string, unknown>;
  if (
    !Number.isInteger(candidate.discussionMinutes) ||
    Number(candidate.discussionMinutes) < 1 ||
    Number(candidate.discussionMinutes) > 15 ||
    typeof candidate.allowNoExile !== 'boolean' ||
    typeof candidate.hideSpecialRoles !== 'boolean' ||
    typeof candidate.showFinalTimeline !== 'boolean' ||
    !Array.isArray(candidate.specialRoles) ||
    !candidate.specialRoles.every(
      (role) => typeof role === 'string' && roleIds.has(role as RoleId),
    )
  )
    throw new Error('Invalid settings');
  return {
    discussionMinutes: Number(candidate.discussionMinutes),
    allowNoExile: false,
    hideSpecialRoles: candidate.hideSpecialRoles,
    showFinalTimeline: candidate.showFinalTimeline,
    specialRoles: [...new Set(candidate.specialRoles as RoleId[])],
  };
}

function row<T>(value: unknown): T | undefined {
  return value as T | undefined;
}

function rows<T>(value: unknown[]): T[] {
  return value as T[];
}

function inTransaction<T>(database: DatabaseSync, operation: () => T): T {
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = operation();
    database.exec('COMMIT');
    return result;
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function normalizeNickname(value: unknown): {
  nickname: string;
  normalized: string;
} {
  assert(
    typeof value === 'string',
    400,
    'bad_request',
    'nickname must be a string',
  );
  const nickname = value.normalize('NFKC').trim().replace(/\s+/g, ' ');
  assert(
    nickname.length >= 1 && nickname.length <= 24,
    400,
    'bad_request',
    'nickname must contain 1 to 24 characters',
  );
  assert(
    !/[\p{Cc}\p{Cf}]/u.test(nickname),
    400,
    'bad_request',
    'nickname contains unsupported characters',
  );
  return { nickname, normalized: nickname.toLocaleLowerCase('en-US') };
}

function randomCode(): string {
  const bytes = randomBytes(4);
  return [...bytes]
    .map((byte) => String.fromCharCode(65 + (byte % 26)))
    .join('');
}

function randomTheme(): ThemeId {
  return themeIds[randomBytes(1)[0]! % themeIds.length]!;
}

function settingsFromRoom(room: RoomRow): RoomSettings {
  return {
    discussionMinutes: room.discussion_minutes,
    allowNoExile: false,
    hideSpecialRoles: room.hide_special_roles === 1,
    showFinalTimeline: room.show_final_timeline === 1,
    specialRoles: JSON.parse(room.special_roles_json) as RoleId[],
  };
}

function phaseDurationMs(
  phase: GamePhase,
  discussionMinutes: number,
): number | null {
  if (phase === 'discussion') return discussionMinutes * 60_000;
  if (phase === 'dawn') return 30_000;
  if (phase === 'day-resolution') return null;
  if (phase === 'hunter-shot') return 30_000;
  if (phase === 'finished') return null;
  return 60_000;
}

export class GameService {
  readonly metrics: ServiceMetrics = {
    commandsAccepted: 0,
    commandsRejected: 0,
    transitions: 0,
  };
  private readonly database: DatabaseSync;
  private readonly domain: DomainAdapter;
  private readonly logger: Logger;
  private readonly sessionSecret: string;
  private readonly sessionTtlSeconds: number;
  private readonly now: () => Date;
  private readonly generateCode: () => string;
  private readonly generateTheme: () => ThemeId;
  private roomChanged: (roomCode: string) => void = () => undefined;

  constructor(options: ServiceOptions) {
    this.database = options.database;
    this.domain = options.domain;
    this.logger = options.logger;
    this.sessionSecret = options.sessionSecret;
    this.sessionTtlSeconds = options.sessionTtlSeconds;
    this.now = options.now ?? (() => new Date());
    this.generateCode = options.generateCode ?? randomCode;
    this.generateTheme = options.generateTheme ?? randomTheme;
    this.resetPresence();
  }

  onRoomChanged(listener: (roomCode: string) => void): void {
    this.roomChanged = listener;
  }

  createRoom(nicknameValue: unknown): {
    credential: string;
    identity: Identity;
    snapshot: GameSnapshot;
  } {
    const { nickname, normalized } = normalizeNickname(nicknameValue);
    const now = this.now();
    let result: { credential: string; identity: Identity } | undefined;
    for (let attempt = 0; attempt < 32 && !result; attempt += 1) {
      const roomId = randomUUID();
      const participantId = randomUUID();
      const code = this.generateCode();
      const themeId = this.generateTheme();
      assert(
        /^[A-Z]{4}$/.test(code),
        500,
        'bad_request',
        'Room code generator returned an invalid code',
      );
      const credential = this.newCredential();
      try {
        result = inTransaction(this.database, () => {
          this.database
            .prepare(
              `INSERT INTO rooms
            (id, code, theme_id, allow_no_exile, created_at, expires_at) VALUES (?, ?, ?, 0, ?, ?)`,
            )
            .run(
              roomId,
              code,
              themeId,
              now.toISOString(),
              new Date(now.getTime() + 86_400_000).toISOString(),
            );
          this.database
            .prepare(
              `INSERT INTO participants
            (id, room_id, nickname, nickname_normalized, avatar_id, is_host, connected, session_hash, session_expires_at, joined_at)
            VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?, ?)`,
            )
            .run(
              participantId,
              roomId,
              nickname,
              normalized,
              this.nextAvatarId(roomId),
              this.hashCredential(credential),
              this.sessionExpiry(now),
              now.toISOString(),
            );
          return {
            credential,
            identity: {
              participantId,
              roomId,
              roomCode: code,
              isHost: true,
              sessionHash: this.hashCredential(credential),
            },
          };
        });
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !error.message.includes('UNIQUE constraint failed: rooms.code')
        )
          throw error;
      }
    }
    if (!result)
      throw new HttpError(503, 'conflict', 'Could not allocate a room code');
    this.logger.log('info', 'room.created', { roomId: result.identity.roomId });
    return { ...result, snapshot: this.project(result.identity) };
  }

  joinRoom(
    codeValue: unknown,
    nicknameValue: unknown,
  ): { credential: string; identity: Identity; snapshot: GameSnapshot } {
    assert(
      typeof codeValue === 'string' && /^[A-Za-z]{4}$/.test(codeValue),
      404,
      'not_found',
      'Room not found',
    );
    const code = codeValue.toUpperCase();
    const { nickname, normalized } = normalizeNickname(nicknameValue);
    const now = this.now();
    this.closeExpiredRooms();
    const credential = this.newCredential();
    let identity: Identity;
    try {
      identity = inTransaction(this.database, () => {
        const room = row<RoomRow>(
          this.database
            .prepare('SELECT * FROM rooms WHERE code = ? AND closed_at IS NULL')
            .get(code),
        );
        assert(room, 404, 'not_found', 'Room not found');
        assert(
          room.status === 'lobby',
          409,
          'conflict',
          'The game has already started',
        );
        const count = row<{ count: number }>(
          this.database
            .prepare(
              'SELECT count(*) AS count FROM participants WHERE room_id = ? AND removed_at IS NULL',
            )
            .get(room.id),
        );
        assert((count?.count ?? 20) < 20, 409, 'conflict', 'The room is full');
        const participantId = randomUUID();
        const avatarId = this.nextAvatarId(room.id);
        this.database
          .prepare(
            `INSERT INTO participants
          (id, room_id, nickname, nickname_normalized, avatar_id, connected, session_hash, session_expires_at, joined_at)
          VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
          )
          .run(
            participantId,
            room.id,
            nickname,
            normalized,
            avatarId,
            this.hashCredential(credential),
            this.sessionExpiry(now),
            now.toISOString(),
          );
        this.database
          .prepare('UPDATE rooms SET version = version + 1 WHERE id = ?')
          .run(room.id);
        return {
          participantId,
          roomId: room.id,
          roomCode: room.code,
          isHost: false,
          sessionHash: this.hashCredential(credential),
        };
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes(
          'UNIQUE constraint failed: participants.room_id, participants.nickname_normalized',
        )
      ) {
        throw new HttpError(409, 'conflict', 'That nickname is already in use');
      }
      throw error;
    }
    this.roomChanged(code);
    this.logger.log('info', 'room.joined', {
      roomId: identity.roomId,
      participantId: identity.participantId,
    });
    return { credential, identity, snapshot: this.project(identity) };
  }

  authenticate(
    credential: string | undefined,
    expectedCode?: string,
  ): Identity | undefined {
    if (!credential) return undefined;
    this.closeExpiredRooms();
    const sessionHash = this.hashCredential(credential);
    const participant = row<
      ParticipantRow & { code: string; session_expires_at: string | null }
    >(
      this.database
        .prepare(
          `
      SELECT p.*, r.code FROM participants p JOIN rooms r ON r.id = p.room_id
      WHERE p.session_hash = ? AND p.removed_at IS NULL AND r.closed_at IS NULL
    `,
        )
        .get(sessionHash),
    );
    if (
      !participant ||
      !participant.session_expires_at ||
      participant.session_expires_at <= this.now().toISOString()
    )
      return undefined;
    if (expectedCode && participant.code !== expectedCode.toUpperCase())
      return undefined;
    return {
      participantId: participant.id,
      roomId: participant.room_id,
      roomCode: participant.code,
      isHost: participant.is_host === 1,
      sessionHash,
    };
  }

  reconnect(identity: Identity): {
    credential: string;
    snapshot: GameSnapshot;
  } {
    const credential = this.newCredential();
    this.database
      .prepare(
        'UPDATE participants SET session_hash = ?, session_expires_at = ? WHERE id = ?',
      )
      .run(
        this.hashCredential(credential),
        this.sessionExpiry(this.now()),
        identity.participantId,
      );
    identity.sessionHash = this.hashCredential(credential);
    this.roomChanged(identity.roomCode);
    this.logger.log('info', 'session.reconnected', {
      roomId: identity.roomId,
      participantId: identity.participantId,
    });
    return { credential, snapshot: this.project(identity) };
  }

  updateSettings(identity: Identity, value: unknown): GameSnapshot {
    assert(
      identity.isHost,
      403,
      'forbidden',
      'Only the host can change settings',
    );
    let settings: RoomSettings;
    try {
      settings = parseSettings(value);
    } catch {
      throw new HttpError(400, 'bad_request', 'Invalid room settings');
    }
    assert(
      !settings.specialRoles.includes('werewolf') &&
        !settings.specialRoles.includes('villager'),
      400,
      'bad_request',
      'Only special roles can be selected',
    );
    const participantCount = this.getParticipants(identity.roomId).length;
    this.domain.validateComposition(
      Math.max(6, participantCount),
      settings.specialRoles,
    );
    inTransaction(this.database, () => {
      const room = this.getRoom(identity.roomId);
      assert(
        room.status === 'lobby',
        409,
        'conflict',
        'Settings are frozen after the game starts',
      );
      this.database
        .prepare(
          `UPDATE rooms SET discussion_minutes = ?, allow_no_exile = ?, hide_special_roles = ?, show_final_timeline = ?, special_roles_json = ?, version = version + 1 WHERE id = ?`,
        )
        .run(
          settings.discussionMinutes,
          0,
          settings.hideSpecialRoles ? 1 : 0,
          settings.showFinalTimeline ? 1 : 0,
          JSON.stringify(settings.specialRoles),
          room.id,
        );
    });
    this.roomChanged(identity.roomCode);
    return this.project(identity);
  }

  setReady(identity: Identity, readyValue: unknown): GameSnapshot {
    assert(
      typeof readyValue === 'boolean',
      400,
      'bad_request',
      'ready must be a boolean',
    );
    inTransaction(this.database, () => {
      const room = this.getRoom(identity.roomId);
      assert(
        room.status === 'lobby',
        409,
        'conflict',
        'Readiness cannot change after the game starts',
      );
      this.database
        .prepare(
          'UPDATE participants SET ready = ? WHERE id = ? AND removed_at IS NULL',
        )
        .run(readyValue ? 1 : 0, identity.participantId);
      this.database
        .prepare('UPDATE rooms SET version = version + 1 WHERE id = ?')
        .run(room.id);
    });
    this.roomChanged(identity.roomCode);
    return this.project(identity);
  }

  setAvatar(identity: Identity, avatarValue: unknown): GameSnapshot {
    assert(
      typeof avatarValue === 'string' &&
        avatarIds.some((avatarId) => avatarId === avatarValue),
      400,
      'bad_request',
      'Invalid avatar',
    );
    const avatarId = avatarValue as AvatarId;
    const changed = inTransaction(this.database, () => {
      const room = this.getRoom(identity.roomId);
      const result = this.database
        .prepare(
          'UPDATE participants SET avatar_id = ? WHERE id = ? AND removed_at IS NULL AND avatar_id != ?',
        )
        .run(avatarId, identity.participantId, avatarId);
      if (result.changes === 0) return false;
      if (room.status === 'lobby') {
        this.database
          .prepare('UPDATE rooms SET version = version + 1 WHERE id = ?')
          .run(room.id);
      } else {
        const game = this.getGame(room.id);
        const version = game.version + 1;
        this.database
          .prepare('UPDATE games SET version = ? WHERE id = ?')
          .run(version, game.id);
        this.database
          .prepare('UPDATE rooms SET version = ? WHERE id = ?')
          .run(version, room.id);
      }
      return true;
    });
    if (changed) this.roomChanged(identity.roomCode);
    return this.project(identity);
  }

  removeParticipant(
    identity: Identity,
    participantId: string,
  ): { clearedSelf: boolean } {
    inTransaction(this.database, () => {
      const room = this.getRoom(identity.roomId);
      assert(
        room.status === 'lobby',
        409,
        'conflict',
        'Players cannot be removed after the game starts',
      );
      const target = row<ParticipantRow>(
        this.database
          .prepare(
            'SELECT * FROM participants WHERE id = ? AND room_id = ? AND removed_at IS NULL',
          )
          .get(participantId, room.id),
      );
      assert(target, 404, 'not_found', 'Participant not found');
      assert(
        identity.participantId === participantId || identity.isHost,
        403,
        'forbidden',
        'Only the host can remove another participant',
      );
      assert(
        target.is_host !== 1,
        409,
        'conflict',
        'The host cannot leave an active room',
      );
      this.database
        .prepare(
          'UPDATE participants SET removed_at = ?, connected = 0, session_hash = NULL, session_expires_at = NULL WHERE id = ?',
        )
        .run(this.now().toISOString(), participantId);
      this.database
        .prepare('UPDATE rooms SET version = version + 1 WHERE id = ?')
        .run(room.id);
    });
    this.roomChanged(identity.roomCode);
    return { clearedSelf: identity.participantId === participantId };
  }

  leaveRoom(identity: Identity): void {
    inTransaction(this.database, () => {
      const room = this.getRoom(identity.roomId);
      assert(
        room.status === 'lobby',
        409,
        'conflict',
        'A player cannot leave after the game starts',
      );
      if (identity.isHost) {
        const now = this.now().toISOString();
        this.database
          .prepare('UPDATE rooms SET closed_at = ? WHERE id = ?')
          .run(now, room.id);
        this.database
          .prepare(
            'UPDATE participants SET removed_at = ?, connected = 0, session_hash = NULL, session_expires_at = NULL WHERE room_id = ? AND removed_at IS NULL',
          )
          .run(now, room.id);
      } else {
        this.database
          .prepare(
            'UPDATE participants SET removed_at = ?, connected = 0, session_hash = NULL, session_expires_at = NULL WHERE id = ?',
          )
          .run(this.now().toISOString(), identity.participantId);
        this.database
          .prepare('UPDATE rooms SET version = version + 1 WHERE id = ?')
          .run(room.id);
      }
    });
    this.roomChanged(identity.roomCode);
  }

  returnAfterGame(identity: Identity): GameSnapshot | null {
    const destination = inTransaction(this.database, () => {
      const room = this.getRoom(identity.roomId);
      assert(
        room.status !== 'playing',
        409,
        'conflict',
        'The game is still in progress',
      );

      if (identity.isHost) {
        if (room.status === 'finished') {
          this.database
            .prepare('DELETE FROM games WHERE room_id = ?')
            .run(room.id);
          this.database
            .prepare(
              'UPDATE participants SET ready = 0 WHERE room_id = ? AND removed_at IS NULL',
            )
            .run(room.id);
          this.database
            .prepare(
              "UPDATE rooms SET status = 'lobby', version = version + 1 WHERE id = ?",
            )
            .run(room.id);
        }
        return 'lobby' as const;
      }

      const hostReturned =
        room.status === 'lobby' &&
        Boolean(
          this.database
            .prepare(
              'SELECT 1 FROM participants WHERE room_id = ? AND is_host = 1 AND connected = 1 AND removed_at IS NULL',
            )
            .get(room.id),
        );
      if (hostReturned) return 'lobby' as const;

      this.database
        .prepare(
          'UPDATE participants SET removed_at = ?, connected = 0, session_hash = NULL, session_expires_at = NULL WHERE id = ?',
        )
        .run(this.now().toISOString(), identity.participantId);
      if (room.status === 'lobby') {
        this.database
          .prepare('UPDATE rooms SET version = version + 1 WHERE id = ?')
          .run(room.id);
      }
      return 'home' as const;
    });
    this.roomChanged(identity.roomCode);
    return destination === 'lobby' ? this.project(identity) : null;
  }

  startGame(identity: Identity): GameSnapshot {
    assert(
      identity.isHost,
      403,
      'forbidden',
      'Only the host can start the game',
    );
    inTransaction(this.database, () => {
      const room = this.getRoom(identity.roomId);
      assert(
        room.status === 'lobby',
        409,
        'conflict',
        'The game has already started',
      );
      const participants = this.getParticipants(room.id);
      const blockers = this.startBlockers(room, participants);
      if (blockers.length > 0)
        throw new HttpError(409, 'conflict', 'The room is not ready to start', {
          blockers: blockers.join(', '),
        });
      const settings = settingsFromRoom(room);
      const composition = this.domain.validateComposition(
        participants.length,
        settings.specialRoles,
      );
      const assignments = this.domain.assignRoles(
        participants.map((participant) => participant.id),
        composition,
      );
      const gameId = randomUUID();
      const phaseId = randomUUID();
      const now = this.now();
      const deadline = new Date(now.getTime() + 60_000).toISOString();
      const gameVersion = room.version + 1;
      this.database
        .prepare(
          `INSERT INTO games
        (id, room_id, status, frozen_settings_json, version, phase, round, deadline, started_at)
        VALUES (?, ?, 'active', ?, ?, 'first-night', 1, ?, ?)`,
        )
        .run(
          gameId,
          room.id,
          JSON.stringify(settings),
          gameVersion,
          deadline,
          now.toISOString(),
        );
      const firstStage: NightStage = assignments.some(
        (assignment) => assignment.role === 'cupid',
      )
        ? 'cupid'
        : 'pack';
      this.database
        .prepare(
          `INSERT INTO phases
        (id, game_id, sequence, kind, round, opened_at, deadline, stage) VALUES (?, ?, 1, 'first-night', 1, ?, ?, ?)`,
        )
        .run(phaseId, gameId, now.toISOString(), deadline, firstStage);
      const insert = this.database.prepare(`INSERT INTO assignments
        (id, game_id, participant_id, role, alignment, resources_json) VALUES (?, ?, ?, ?, ?, ?)`);
      for (const assignment of assignments) {
        insert.run(
          randomUUID(),
          gameId,
          assignment.participantId,
          assignment.role,
          this.domain.alignment(assignment.role),
          JSON.stringify(initialResources(assignment.role)),
        );
      }
      this.database
        .prepare(
          "UPDATE rooms SET status = 'playing', version = ? WHERE id = ? AND status = 'lobby'",
        )
        .run(gameVersion, room.id);
      this.advanceCompletedStages(gameId);
    });
    this.roomChanged(identity.roomCode);
    this.logger.log('info', 'game.started', { roomId: identity.roomId });
    return this.project(identity);
  }

  submitCommand(
    identity: Identity,
    value: unknown,
  ): { duplicate: boolean; snapshot: GameSnapshot } {
    const command = this.parseCommand(value);
    let duplicate = false;
    try {
      inTransaction(this.database, () => {
        const game = this.getGame(identity.roomId);
        const prior = row<{ response_json: string }>(
          this.database
            .prepare(
              'SELECT response_json FROM idempotency WHERE participant_id = ? AND command_id = ?',
            )
            .get(identity.participantId, command.commandId),
        );
        if (prior) {
          duplicate = true;
          return;
        }
        assert(
          game.status === 'active',
          409,
          'phase_closed',
          'The game is finished',
        );
        assert(
          game.version === command.expectedVersion,
          409,
          'stale_command',
          'The game version has changed',
        );
        assert(
          game.phase === command.expectedPhase,
          409,
          'phase_closed',
          'That phase is no longer active',
        );
        assert(
          !game.deadline || game.deadline > this.now().toISOString(),
          409,
          'phase_closed',
          'That phase deadline has passed',
        );
        const phase = row<PhaseRow>(
          this.database
            .prepare(
              'SELECT * FROM phases WHERE game_id = ? AND closed_at IS NULL',
            )
            .get(game.id),
        );
        assert(phase, 409, 'phase_closed', 'No phase is accepting commands');
        const assignment = row<AssignmentRow>(
          this.database
            .prepare(
              'SELECT participant_id, role, alignment, alive, resources_json FROM assignments WHERE game_id = ? AND participant_id = ?',
            )
            .get(game.id, identity.participantId),
        );
        assert(assignment, 403, 'forbidden', 'Participant is not in this game');
        this.validateAction(game, phase, assignment, command);
        this.database
          .prepare(
            `INSERT INTO actions
          (id, game_id, phase_id, participant_id, action_type, targets_json, submitted_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(phase_id, participant_id, action_type) DO UPDATE SET targets_json = excluded.targets_json, submitted_at = excluded.submitted_at`,
          )
          .run(
            randomUUID(),
            game.id,
            phase.id,
            identity.participantId,
            command.action,
            JSON.stringify(command.targets),
            this.now().toISOString(),
          );
        const nextVersion = game.version + 1;
        this.database
          .prepare('UPDATE games SET version = ? WHERE id = ?')
          .run(nextVersion, game.id);
        this.database
          .prepare('UPDATE rooms SET version = ? WHERE id = ?')
          .run(nextVersion, game.room_id);
        this.database
          .prepare(
            `INSERT INTO idempotency
          (participant_id, command_id, game_id, response_status, response_json, created_at) VALUES (?, ?, ?, 200, ?, ?)`,
          )
          .run(
            identity.participantId,
            command.commandId,
            game.id,
            JSON.stringify({ accepted: true, version: nextVersion }),
            this.now().toISOString(),
          );
        this.advanceCompletedStages(game.id);
      });
    } catch (error) {
      this.metrics.commandsRejected += 1;
      throw error;
    }
    if (!duplicate) {
      this.metrics.commandsAccepted += 1;
      this.roomChanged(identity.roomCode);
    }
    return { duplicate, snapshot: this.project(identity) };
  }

  markReadyForVote(identity: Identity): GameSnapshot {
    let changed = false;
    let advanced = false;
    inTransaction(this.database, () => {
      const game = this.getGame(identity.roomId);
      assert(
        game.status === 'active' && game.phase === 'discussion',
        409,
        'phase_closed',
        'The discussion is no longer active',
      );
      assert(
        !game.deadline || game.deadline > this.now().toISOString(),
        409,
        'phase_closed',
        'The discussion deadline has passed',
      );
      const phase = row<PhaseRow>(
        this.database
          .prepare(
            "SELECT * FROM phases WHERE game_id = ? AND kind = 'discussion' AND closed_at IS NULL",
          )
          .get(game.id),
      );
      assert(phase, 409, 'phase_closed', 'The discussion is no longer active');
      const assignment = row<AssignmentRow>(
        this.database
          .prepare(
            'SELECT participant_id, role, alignment, alive, resources_json FROM assignments WHERE game_id = ? AND participant_id = ?',
          )
          .get(game.id, identity.participantId),
      );
      assert(
        assignment?.alive === 1,
        403,
        'forbidden',
        'Only living players can get ready to vote',
      );
      const inserted = this.database
        .prepare(
          `INSERT OR IGNORE INTO actions
            (id, game_id, phase_id, participant_id, action_type, targets_json, submitted_at)
           VALUES (?, ?, ?, ?, 'discussion-ready', '[]', ?)`,
        )
        .run(
          randomUUID(),
          game.id,
          phase.id,
          identity.participantId,
          this.now().toISOString(),
        );
      if (inserted.changes === 0) return;
      changed = true;
      const readiness = this.discussionReadiness(
        game.id,
        phase.id,
        identity.participantId,
      );
      if (readiness.readyCount >= readiness.requiredCount) {
        advanced = this.advancePhase(phase, 'complete');
      } else {
        this.bumpGameVersion(game.id, game.room_id, {
          phase: game.phase,
          round: game.round,
          deadline: game.deadline,
        });
      }
    });
    if (changed) {
      if (advanced) this.metrics.transitions += 1;
      this.roomChanged(identity.roomCode);
    }
    return this.project(identity);
  }

  acknowledgeDayResolution(
    identity: Identity,
    expectedRoundValue: unknown,
  ): GameSnapshot {
    assert(
      Number.isInteger(expectedRoundValue) && Number(expectedRoundValue) >= 1,
      400,
      'bad_request',
      'expectedRound must be a positive integer',
    );
    const expectedRound = Number(expectedRoundValue);
    let changed = false;
    let advanced = false;
    inTransaction(this.database, () => {
      const game = this.getGame(identity.roomId);
      const phase = row<PhaseRow>(
        this.database
          .prepare(
            "SELECT * FROM phases WHERE game_id = ? AND kind = 'day-resolution' AND round = ? AND closed_at IS NULL",
          )
          .get(game.id, expectedRound),
      );
      if (!phase || game.status !== 'active') {
        const previousAcknowledgement = this.database
          .prepare(
            `SELECT 1 FROM actions a JOIN phases p ON p.id = a.phase_id
             WHERE a.game_id = ? AND a.participant_id = ?
               AND a.action_type = 'day-resolution-ok'
               AND p.kind = 'day-resolution' AND p.round = ?`,
          )
          .get(game.id, identity.participantId, expectedRound);
        assert(
          previousAcknowledgement,
          409,
          'phase_closed',
          'The day summary is no longer active',
        );
        return;
      }
      const assignment = this.database
        .prepare(
          'SELECT 1 FROM assignments WHERE game_id = ? AND participant_id = ?',
        )
        .get(game.id, identity.participantId);
      assert(
        assignment,
        403,
        'forbidden',
        'Only game participants can acknowledge the day summary',
      );
      const inserted = this.database
        .prepare(
          `INSERT OR IGNORE INTO actions
            (id, game_id, phase_id, participant_id, action_type, targets_json, submitted_at)
           VALUES (?, ?, ?, ?, 'day-resolution-ok', '[]', ?)`,
        )
        .run(
          randomUUID(),
          game.id,
          phase.id,
          identity.participantId,
          this.now().toISOString(),
        );
      if (inserted.changes === 0) return;
      changed = true;
      const acknowledgement = this.dayResolutionAcknowledgement(
        game.id,
        phase.id,
        identity.participantId,
      );
      if (acknowledgement.acknowledgedCount >= acknowledgement.requiredCount) {
        advanced = this.advancePhase(phase, 'complete');
      } else {
        this.bumpGameVersion(game.id, game.room_id, {
          phase: game.phase,
          round: game.round,
          deadline: game.deadline,
        });
      }
    });
    if (changed) {
      if (advanced) this.metrics.transitions += 1;
      this.roomChanged(identity.roomCode);
    }
    return this.project(identity);
  }

  project(identity: Identity): GameSnapshot {
    const room = this.getRoom(identity.roomId);
    const participants = this.getParticipants(room.id);
    const game = row<GameRow>(
      this.database
        .prepare('SELECT * FROM games WHERE room_id = ?')
        .get(room.id),
    );
    const assignment = game
      ? row<AssignmentRow>(
          this.database
            .prepare(
              'SELECT participant_id, role, alignment, alive, resources_json FROM assignments WHERE game_id = ? AND participant_id = ?',
            )
            .get(game.id, identity.participantId),
        )
      : undefined;
    const assignments = game
      ? rows<AssignmentRow>(
          this.database
            .prepare(
              'SELECT participant_id, role, alignment, alive, resources_json FROM assignments WHERE game_id = ?',
            )
            .all(game.id),
        )
      : [];
    const aliveById = new Map(
      assignments.map((item) => [item.participant_id, item.alive === 1]),
    );
    const settings = game
      ? ({
          hideSpecialRoles: false,
          showFinalTimeline: true,
          ...(JSON.parse(game.frozen_settings_json) as Partial<RoomSettings>),
        } as RoomSettings)
      : settingsFromRoom(room);
    const publicSettings = settings.hideSpecialRoles
      ? { ...settings, specialRoles: [] }
      : settings;
    const announcements = game
      ? this.publicAnnouncements(game, participants)
      : [];
    const knownPlayers =
      game && assignment ? this.knownPlayers(game.id, assignment) : [];
    const availableAction =
      game && assignment
        ? this.availableAction(game, assignment, assignments)
        : null;
    const discussionReadiness =
      game?.phase === 'discussion'
        ? this.discussionReadiness(
            game.id,
            row<{ id: string }>(
              this.database
                .prepare(
                  "SELECT id FROM phases WHERE game_id = ? AND kind = 'discussion' AND closed_at IS NULL",
                )
                .get(game.id),
            )?.id ?? '',
            identity.participantId,
          )
        : null;
    const dayResolutionAcknowledgement =
      game?.phase === 'day-resolution'
        ? this.dayResolutionAcknowledgement(
            game.id,
            row<{ id: string }>(
              this.database
                .prepare(
                  "SELECT id FROM phases WHERE game_id = ? AND kind = 'day-resolution' AND closed_at IS NULL",
                )
                .get(game.id),
            )?.id ?? '',
            identity.participantId,
          )
        : null;
    const personalWinner = game
      ? Boolean(
          this.database
            .prepare(
              "SELECT 1 FROM winners WHERE game_id = ? AND participant_id = ? AND kind = 'personal'",
            )
            .get(game.id, identity.participantId),
        )
      : false;
    const blockers =
      room.status === 'lobby' ? this.startBlockers(room, participants) : [];
    const snapshot: GameSnapshot = {
      public: {
        roomCode: room.code,
        themeId: room.theme_id,
        roleArtworkSetId: game ? roleArtworkSetForGame(game.id) : null,
        status: room.status,
        version: game?.version ?? room.version,
        round: game?.round ?? 0,
        phase: game?.phase ?? 'lobby',
        deadline: game?.deadline ?? null,
        players: participants.map((participant) => ({
          id: participant.id,
          nickname: participant.nickname,
          avatarId: participant.avatar_id,
          alive: aliveById.get(participant.id) ?? true,
          ready: participant.ready === 1,
          connection:
            participant.connected === 1 ? 'connected' : 'disconnected',
          host: participant.is_host === 1,
        })),
        settings: publicSettings,
        discussionReadiness: discussionReadiness
          ? {
              readyCount: discussionReadiness.readyCount,
              requiredCount: discussionReadiness.requiredCount,
            }
          : null,
        dayResolutionAcknowledgement: dayResolutionAcknowledgement
          ? {
              acknowledgedCount: dayResolutionAcknowledgement.acknowledgedCount,
              requiredCount: dayResolutionAcknowledgement.requiredCount,
            }
          : null,
        announcements,
        winner: game?.winner ?? null,
      },
      private: {
        playerId: identity.participantId,
        role: assignment?.role ?? null,
        alignment: assignment?.alignment ?? null,
        objective: assignment ? objective(assignment.role) : null,
        knownPlayers,
        resources: assignment
          ? (JSON.parse(assignment.resources_json) as Record<
              string,
              boolean | number | string
            >)
          : {},
        availableAction,
        readyForVote: discussionReadiness?.selfReady ?? false,
        acknowledgedDayResolution:
          dayResolutionAcknowledgement?.selfAcknowledged ?? false,
        personalWinner,
      },
      host: identity.isHost
        ? {
            canConfigure: room.status === 'lobby',
            canStart: room.status === 'lobby' && blockers.length === 0,
            startBlockers: blockers,
            configuredSpecialRoles: settings.specialRoles,
          }
        : null,
    };
    if (game?.status === 'finished') {
      const winners = new Set(
        rows<{ participant_id: string }>(
          this.database
            .prepare('SELECT participant_id FROM winners WHERE game_id = ?')
            .all(game.id),
        ).map((item) => item.participant_id),
      );
      snapshot.finalRoles = assignments.map((item) => ({
        playerId: item.participant_id,
        nickname:
          participants.find(
            (participant) => participant.id === item.participant_id,
          )?.nickname ?? 'Unknown',
        role: item.role,
        winner: winners.has(item.participant_id),
      }));
      if (settings.showFinalTimeline !== false)
        snapshot.finalEvents = rows<{
          sequence: number;
          effect_type: string;
          data_json: string;
        }>(
          this.database
            .prepare(
              "SELECT sequence, effect_type, data_json FROM effects WHERE game_id = ? AND visibility != 'private' ORDER BY sequence",
            )
            .all(game.id),
        ).map((effect) => ({
          sequence: effect.sequence,
          type: effect.effect_type,
          data: JSON.parse(effect.data_json) as Record<string, unknown>,
        }));
    }
    return snapshot;
  }

  private discussionReadiness(
    gameId: string,
    phaseId: string,
    participantId: string,
  ): { readyCount: number; requiredCount: number; selfReady: boolean } {
    const aliveCount = row<{ count: number }>(
      this.database
        .prepare(
          'SELECT count(*) AS count FROM assignments WHERE game_id = ? AND alive = 1',
        )
        .get(gameId),
    )?.count;
    const ready = rows<{ participant_id: string }>(
      this.database
        .prepare(
          `SELECT a.participant_id FROM actions a
           JOIN assignments s ON s.game_id = a.game_id AND s.participant_id = a.participant_id
           WHERE a.phase_id = ? AND a.action_type = 'discussion-ready' AND s.alive = 1`,
        )
        .all(phaseId),
    );
    return {
      readyCount: ready.length,
      requiredCount: Math.floor((aliveCount ?? 0) / 2) + 1,
      selfReady: ready.some((item) => item.participant_id === participantId),
    };
  }

  private dayResolutionAcknowledgement(
    gameId: string,
    phaseId: string,
    participantId: string,
  ): {
    acknowledgedCount: number;
    requiredCount: number;
    selfAcknowledged: boolean;
  } {
    const requiredCount =
      row<{ count: number }>(
        this.database
          .prepare(
            'SELECT count(*) AS count FROM assignments WHERE game_id = ?',
          )
          .get(gameId),
      )?.count ?? 0;
    const acknowledged = rows<{ participant_id: string }>(
      this.database
        .prepare(
          "SELECT participant_id FROM actions WHERE phase_id = ? AND action_type = 'day-resolution-ok'",
        )
        .all(phaseId),
    );
    return {
      acknowledgedCount: acknowledged.length,
      requiredCount,
      selfAcknowledged: acknowledged.some(
        (item) => item.participant_id === participantId,
      ),
    };
  }

  setConnected(identity: Identity, connected: boolean): void {
    const changed = inTransaction(this.database, () => {
      const result = this.database
        .prepare(
          'UPDATE participants SET connected = ? WHERE id = ? AND removed_at IS NULL AND connected != ?',
        )
        .run(connected ? 1 : 0, identity.participantId, connected ? 1 : 0);
      if (result.changes === 0) return false;
      const room = this.getRoom(identity.roomId);
      if (room.status === 'lobby') {
        this.database
          .prepare('UPDATE rooms SET version = version + 1 WHERE id = ?')
          .run(identity.roomId);
      } else if (room.status === 'playing') {
        const game = this.getGame(identity.roomId);
        this.database
          .prepare('UPDATE games SET version = version + 1 WHERE id = ?')
          .run(game.id);
        this.database
          .prepare('UPDATE rooms SET version = version + 1 WHERE id = ?')
          .run(identity.roomId);
      }
      return true;
    });
    if (changed) this.roomChanged(identity.roomCode);
  }

  isIdentityCurrent(identity: Identity): boolean {
    this.closeExpiredRooms();
    return Boolean(
      this.database
        .prepare(
          `SELECT 1 FROM participants p JOIN rooms r ON r.id = p.room_id
          WHERE p.id = ? AND p.session_hash = ? AND p.removed_at IS NULL
            AND p.session_expires_at > ? AND r.closed_at IS NULL AND r.expires_at > ?`,
        )
        .get(
          identity.participantId,
          identity.sessionHash,
          this.now().toISOString(),
          this.now().toISOString(),
        ),
    );
  }

  runDuePhases(): number {
    const due = rows<PhaseRow & { code: string }>(
      this.database
        .prepare(
          `
      SELECT p.*, r.code FROM phases p
      JOIN games g ON g.id = p.game_id JOIN rooms r ON r.id = g.room_id
      WHERE p.closed_at IS NULL AND p.deadline IS NOT NULL AND p.deadline <= ?
        AND r.closed_at IS NULL ORDER BY p.deadline
    `,
        )
        .all(this.now().toISOString()),
    );
    let advanced = 0;
    for (const phase of due) {
      const didAdvance = inTransaction(this.database, () => {
        const advancedPhase = this.advancePhase(phase, 'deadline');
        if (advancedPhase) this.advanceCompletedStages(phase.game_id);
        return advancedPhase;
      });
      if (didAdvance) {
        advanced += 1;
        this.metrics.transitions += 1;
        this.roomChanged(phase.code);
        this.logger.log('info', 'game.phase_transition', {
          gameId: phase.game_id,
          from: phase.kind,
        });
      }
    }
    return advanced;
  }

  private advanceCompletedStages(gameId: string): void {
    for (;;) {
      const game = row<GameRow>(
        this.database.prepare('SELECT * FROM games WHERE id = ?').get(gameId),
      );
      if (!game || game.status !== 'active') return;
      const phase = row<PhaseRow>(
        this.database
          .prepare(
            'SELECT * FROM phases WHERE game_id = ? AND closed_at IS NULL',
          )
          .get(gameId),
      );
      if (!phase || !this.allRequiredActorsSubmitted(game, phase)) return;
      if (!this.advancePhase(phase, 'complete')) return;
      const current = row<PhaseRow>(
        this.database
          .prepare(
            'SELECT * FROM phases WHERE game_id = ? AND closed_at IS NULL',
          )
          .get(gameId),
      );
      if (
        !current ||
        (current.kind !== 'first-night' && current.kind !== 'night')
      )
        return;
    }
  }

  private advancePhase(
    candidate: PhaseRow,
    reason: 'deadline' | 'complete',
  ): boolean {
    const phase = row<PhaseRow>(
      this.database
        .prepare('SELECT * FROM phases WHERE id = ? AND closed_at IS NULL')
        .get(candidate.id),
    );
    if (!phase) return false;
    if (
      reason === 'deadline' &&
      (!phase.deadline || phase.deadline > this.now().toISOString())
    )
      return false;
    const game = row<GameRow>(
      this.database
        .prepare('SELECT * FROM games WHERE id = ?')
        .get(phase.game_id),
    );
    if (!game || game.status !== 'active') return false;

    if (phase.kind === 'first-night' || phase.kind === 'night') {
      if (phase.stage === 'cupid') {
        this.resolveCupid(game, phase);
        this.recordMissingAbstentions(game, phase);
        this.updateNightStage(game, phase, 'pack');
        return true;
      }
      if (phase.stage === 'pack') {
        this.lockWolfTarget(game, phase);
        this.recordMissingAbstentions(game, phase);
        this.updateNightStage(game, phase, 'night-actions');
        return true;
      }
    }

    const claimed = this.database
      .prepare(
        'UPDATE phases SET closed_at = ?, close_reason = ? WHERE id = ? AND closed_at IS NULL',
      )
      .run(this.now().toISOString(), reason, phase.id);
    if (claimed.changes === 0) return false;
    this.recordMissingAbstentions(game, phase);

    if (phase.kind === 'first-night' || phase.kind === 'night')
      this.resolveNight(game, phase);
    if (phase.kind === 'voting') this.resolveDay(game, phase);
    if (phase.kind === 'hunter-shot') this.resolveHunter(game, phase);

    const hunterId =
      phase.kind === 'hunter-shot' ? null : this.pendingHunterId(phase.id);
    if (!hunterId && this.finishIfWon(game.id)) return true;
    if (hunterId) {
      const resumePhase =
        phase.kind === 'first-night' || phase.kind === 'night'
          ? 'dawn'
          : 'day-resolution';
      this.openPhase(game, phase, 'hunter-shot', phase.round, resumePhase);
      return true;
    }

    const next =
      phase.kind === 'hunter-shot'
        ? (phase.resume_phase ?? 'dawn')
        : this.nextPhase(phase.kind);
    const nextRound =
      phase.kind === 'day-resolution' ? phase.round + 1 : phase.round;
    this.openPhase(game, phase, next, nextRound, null);
    return true;
  }

  private updateNightStage(
    game: GameRow,
    phase: PhaseRow,
    stage: NightStage,
  ): void {
    const deadline = new Date(this.now().getTime() + 60_000).toISOString();
    this.database
      .prepare('UPDATE phases SET stage = ?, deadline = ? WHERE id = ?')
      .run(stage, deadline, phase.id);
    this.bumpGameVersion(game.id, game.room_id, {
      phase: game.phase,
      round: game.round,
      deadline,
    });
  }

  private openPhase(
    game: GameRow,
    previous: PhaseRow,
    next: GamePhase,
    round: number,
    resumePhase: GamePhase | null,
  ): void {
    const room = this.getRoom(game.room_id);
    const duration = phaseDurationMs(next, room.discussion_minutes);
    const now = this.now();
    const deadline =
      duration === null
        ? null
        : new Date(now.getTime() + duration).toISOString();
    const stage: NightStage | 'main' =
      next === 'night' || next === 'first-night' ? 'pack' : 'main';
    this.database
      .prepare(
        `INSERT INTO phases
      (id, game_id, sequence, kind, round, opened_at, deadline, stage, resume_phase)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        game.id,
        previous.sequence + 1,
        next,
        round,
        now.toISOString(),
        deadline,
        stage,
        resumePhase,
      );
    this.bumpGameVersion(game.id, game.room_id, {
      phase: next,
      round,
      deadline,
    });
  }

  private bumpGameVersion(
    gameId: string,
    roomId: string,
    state: { phase: GamePhase; round: number; deadline: string | null },
  ): void {
    const version = row<{ version: number }>(
      this.database
        .prepare('SELECT version FROM games WHERE id = ?')
        .get(gameId),
    )?.version;
    assert(version !== undefined, 409, 'conflict', 'The game is unavailable');
    const nextVersion = version + 1;
    this.database
      .prepare(
        'UPDATE games SET phase = ?, round = ?, deadline = ?, version = ? WHERE id = ?',
      )
      .run(state.phase, state.round, state.deadline, nextVersion, gameId);
    this.database
      .prepare('UPDATE rooms SET version = ? WHERE id = ?')
      .run(nextVersion, roomId);
  }

  private resolveCupid(game: GameRow, phase: PhaseRow): void {
    const action = row<ActionRow>(
      this.database
        .prepare(
          "SELECT participant_id, action_type, targets_json FROM actions WHERE phase_id = ? AND action_type = 'cupid-link' LIMIT 1",
        )
        .get(phase.id),
    );
    if (!action) return;
    const targets = this.actionTargets(action);
    if (targets.length !== 2) return;
    const bond = this.domain.createLoverBond(
      action.participant_id,
      targets[0]!,
      targets[1]!,
      this.domainPlayers(game.id),
    );
    this.addEffect(game.id, phase.id, 'lovers', 'final', null, {
      players: [bond.firstId, bond.secondId],
    });
    this.addEffect(game.id, phase.id, 'lover-known', 'private', bond.firstId, {
      playerId: bond.secondId,
      fact: 'lover',
    });
    this.addEffect(game.id, phase.id, 'lover-known', 'private', bond.secondId, {
      playerId: bond.firstId,
      fact: 'lover',
    });
  }

  private lockWolfTarget(game: GameRow, phase: PhaseRow): void {
    const players = this.domainPlayers(game.id);
    const votes = rows<ActionRow>(
      this.database
        .prepare(
          "SELECT participant_id, action_type, targets_json FROM actions WHERE phase_id = ? AND action_type = 'wolf-vote'",
        )
        .all(phase.id),
    ).flatMap((action) => {
      const targetId = this.actionTargets(action)[0];
      return targetId ? [{ voterId: action.participant_id, targetId }] : [];
    });
    const result = this.domain.resolveWolfVotes(votes, players);
    this.addEffect(game.id, phase.id, 'wolf-target-locked', 'final', null, {
      targetId: result.targetId,
      tied: result.tied,
      tally: result.tally,
    });
  }

  private resolveNight(game: GameRow, phase: PhaseRow): void {
    const actions = rows<ActionRow>(
      this.database
        .prepare(
          'SELECT participant_id, action_type, targets_json FROM actions WHERE phase_id = ?',
        )
        .all(phase.id),
    );
    const assignments = this.getAssignments(game.id);
    const players = this.toDomainPlayers(assignments);
    const byRole = (role: RoleId) =>
      assignments.find((item) => item.role === role && item.alive === 1);
    const actionOf = (...types: GameActionType[]) =>
      actions.find((action) => types.includes(action.action_type));
    const wolfVotes = actions
      .filter((action) => action.action_type === 'wolf-vote')
      .flatMap((action) => {
        const targetId = this.actionTargets(action)[0];
        return targetId ? [{ voterId: action.participant_id, targetId }] : [];
      });
    const witch = byRole('witch');
    const witchActionRow = actionOf('witch-heal', 'witch-poison');
    let witchAction: WitchAction | null = null;
    if (witchActionRow) {
      const targetId = this.actionTargets(witchActionRow)[0];
      witchAction = !targetId
        ? { kind: 'abstain' }
        : witchActionRow.action_type === 'witch-heal'
          ? { kind: 'heal' }
          : { kind: 'poison', targetId };
    }
    const doctor = byRole('doctor');
    const doctorAction = actionOf('doctor-protect');
    const guardian = byRole('guardian');
    const guardianAction = actionOf('guardian-protect');
    const result = this.domain.resolveNight({
      players,
      wolfVotes,
      lockedWolfTargetId: this.wolfTargetForPhase(phase.id),
      witchId: witch?.participant_id ?? null,
      witchResources: witch
        ? toWitchResources(
            JSON.parse(witch.resources_json) as Record<
              string,
              boolean | number | string
            >,
          )
        : { healingPotion: false, poisonPotion: false },
      witchAction,
      doctorId: doctor?.participant_id ?? null,
      doctorTargetId: doctorAction
        ? (this.actionTargets(doctorAction)[0] ?? null)
        : null,
      previousDoctorTargetId: doctor
        ? this.previousDoctorTarget(game.id, phase, doctor.participant_id)
        : null,
      guardianId: guardian?.participant_id ?? null,
      guardianTargetId: guardianAction
        ? (this.actionTargets(guardianAction)[0] ?? null)
        : null,
      lovers: this.getLovers(game.id),
      hunterShots: {},
      personalWinnerIds: this.personalWinnerIds(game.id),
    });
    if (witch) {
      this.database
        .prepare(
          'UPDATE assignments SET resources_json = ? WHERE game_id = ? AND participant_id = ?',
        )
        .run(
          JSON.stringify(fromWitchResources(result.witchResources)),
          game.id,
          witch.participant_id,
        );
    }
    this.resolveNightKnowledge(game, phase, actions, players);
    for (const effect of result.effects)
      this.addEffect(game.id, phase.id, effect.type, 'final', null, effect);
    this.applyDomainDeaths(game.id, phase.id, result.players, result.deaths);
  }

  private resolveNightKnowledge(
    game: GameRow,
    phase: PhaseRow,
    actions: ActionRow[],
    players: DomainPlayer[],
  ): void {
    for (const action of actions) {
      const targetId = this.actionTargets(action)[0];
      if (action.action_type === 'seer-inspect' && targetId) {
        const alignment = this.domain.inspectAlignment(
          action.participant_id,
          targetId,
          players,
        );
        this.addEffect(
          game.id,
          phase.id,
          'inspection',
          'private',
          action.participant_id,
          { playerId: targetId, fact: alignment },
        );
      }
      if (action.action_type === 'little-girl-spy') {
        const result = this.domain.resolveLittleGirlSpy(
          action.participant_id,
          players,
        );
        this.addEffect(game.id, phase.id, 'little-girl-random', 'final', null, {
          littleGirlId: result.littleGirlId,
          ...result.randomFact,
        });
        if (result.revealedWerewolfId) {
          this.addEffect(
            game.id,
            phase.id,
            'spy-result',
            'private',
            action.participant_id,
            { playerId: result.revealedWerewolfId, fact: 'werewolf' },
          );
        }
        for (const wolfId of result.revealedToWerewolfIds) {
          this.addEffect(game.id, phase.id, 'spy-detected', 'private', wolfId, {
            playerId: action.participant_id,
            fact: 'little-girl',
          });
        }
      }
    }
  }

  private resolveDay(game: GameRow, phase: PhaseRow): void {
    const settings = JSON.parse(game.frozen_settings_json) as RoomSettings;
    const votes = rows<ActionRow>(
      this.database
        .prepare(
          "SELECT participant_id, action_type, targets_json FROM actions WHERE phase_id = ? AND action_type = 'day-vote'",
        )
        .all(phase.id),
    ).flatMap((action) => {
      const targetId = this.actionTargets(action)[0];
      return targetId ? [{ voterId: action.participant_id, targetId }] : [];
    });
    const result = this.domain.resolveDay(this.domainPlayers(game.id), votes, {
      allowNoExile: settings.allowNoExile,
      lovers: this.getLovers(game.id),
      hunterShots: {},
      personalWinnerIds: this.personalWinnerIds(game.id),
    });
    for (const winnerId of result.personalWinnerIds) {
      this.database
        .prepare(
          "INSERT OR IGNORE INTO winners (game_id, participant_id, kind, reason) VALUES (?, ?, 'personal', 'exiled-fool')",
        )
        .run(game.id, winnerId);
    }
    this.addEffect(game.id, phase.id, 'day-vote-result', 'public', null, {
      exiledPlayerId: result.vote.exiledPlayerId,
      reason: result.vote.reason,
      tally: result.vote.tally,
    });
    this.applyDomainDeaths(game.id, phase.id, result.players, result.deaths);
  }

  private resolveHunter(game: GameRow, phase: PhaseRow): void {
    const action = row<ActionRow>(
      this.database
        .prepare(
          "SELECT participant_id, action_type, targets_json FROM actions WHERE phase_id = ? AND action_type = 'hunter-shoot' LIMIT 1",
        )
        .get(phase.id),
    );
    const targetId = action ? this.actionTargets(action)[0] : undefined;
    if (!action || !targetId) return;
    const players = this.domainPlayers(game.id);
    const chain = this.domain.resolveDeathChain(
      players,
      [
        {
          playerId: targetId,
          cause: 'hunter-shot',
          causedById: action.participant_id,
        },
      ],
      this.getLovers(game.id),
    );
    const dead = new Set(chain.deaths.map((death) => death.playerId));
    const resolved = players.map((player) =>
      dead.has(player.id) ? { ...player, alive: false } : player,
    );
    this.applyDomainDeaths(game.id, phase.id, resolved, chain.deaths);
  }

  private applyDomainDeaths(
    gameId: string,
    phaseId: string,
    players: readonly DomainPlayer[],
    deaths: readonly {
      playerId: string;
      cause: string;
      causedById: string | null;
    }[],
  ): void {
    for (const player of players) {
      this.database
        .prepare(
          'UPDATE assignments SET alive = ? WHERE game_id = ? AND participant_id = ?',
        )
        .run(player.alive ? 1 : 0, gameId, player.id);
    }
    for (const death of deaths) {
      this.addEffect(gameId, phaseId, 'elimination', 'public', null, {
        participantId: death.playerId,
        cause: death.cause,
        causedById: death.causedById,
      });
    }
  }

  private finishIfWon(gameId: string): boolean {
    const game = row<GameRow>(
      this.database.prepare('SELECT * FROM games WHERE id = ?').get(gameId),
    );
    if (!game || game.status === 'finished') return game?.status === 'finished';
    const victory = this.domain.evaluateVictory(
      this.domainPlayers(game.id),
      this.getLovers(game.id),
      this.personalWinnerIds(game.id),
    );
    if (!victory) return false;
    this.finishGame(game, victory);
    return true;
  }

  private finishGame(game: GameRow, victory: VictoryResult): void {
    const assignments = this.getAssignments(game.id);
    const lovers = this.getLovers(game.id);
    const mainWinnerIds =
      victory.mainWinner === 'lovers'
        ? lovers
          ? [lovers.firstId, lovers.secondId]
          : []
        : assignments
            .filter((assignment) =>
              victory.mainWinner === 'werewolves'
                ? isWerewolfRole(assignment.role)
                : assignment.alignment === 'village',
            )
            .map((assignment) => assignment.participant_id);
    for (const participantId of mainWinnerIds) {
      this.database
        .prepare(
          'INSERT OR IGNORE INTO winners (game_id, participant_id, kind, reason) VALUES (?, ?, ?, ?)',
        )
        .run(game.id, participantId, 'main', victory.mainWinner);
    }
    for (const participantId of victory.personalWinnerIds) {
      this.database
        .prepare(
          'INSERT OR IGNORE INTO winners (game_id, participant_id, kind, reason) VALUES (?, ?, ?, ?)',
        )
        .run(game.id, participantId, 'personal', 'personal');
    }
    const version =
      row<{ version: number }>(
        this.database
          .prepare('SELECT version FROM games WHERE id = ?')
          .get(game.id),
      )!.version + 1;
    const now = this.now().toISOString();
    this.database
      .prepare(
        "UPDATE games SET status = 'finished', phase = 'finished', deadline = NULL, winner = ?, version = ?, finished_at = ? WHERE id = ?",
      )
      .run(victory.mainWinner, version, now, game.id);
    this.database
      .prepare("UPDATE rooms SET status = 'finished', version = ? WHERE id = ?")
      .run(version, game.room_id);
    this.database
      .prepare(
        "UPDATE phases SET closed_at = coalesce(closed_at, ?), close_reason = coalesce(close_reason, 'game-finished') WHERE game_id = ? AND closed_at IS NULL",
      )
      .run(now, game.id);
    this.addEffect(game.id, null, 'game-finished', 'public', null, {
      winner: victory.mainWinner,
    });
  }

  private allRequiredActorsSubmitted(game: GameRow, phase: PhaseRow): boolean {
    const required = this.requiredActorIds(game, phase);
    if (required.length === 0) {
      return phase.kind === 'first-night' || phase.kind === 'night';
    }
    const submitted = new Set(
      rows<{ participant_id: string }>(
        this.database
          .prepare(
            'SELECT DISTINCT participant_id FROM actions WHERE phase_id = ?',
          )
          .all(phase.id),
      ).map((item) => item.participant_id),
    );
    return required.every((participantId) => submitted.has(participantId));
  }

  private requiredActorIds(game: GameRow, phase: PhaseRow): string[] {
    const assignments = this.getAssignments(game.id).filter(
      (assignment) => assignment.alive === 1,
    );
    if (phase.kind === 'voting')
      return assignments.map((assignment) => assignment.participant_id);
    if (phase.kind === 'hunter-shot') {
      const hunter = this.pendingHunterForOpenPhase(game.id, phase);
      return hunter ? [hunter] : [];
    }
    if (phase.kind !== 'first-night' && phase.kind !== 'night') return [];
    if (phase.stage === 'cupid')
      return assignments
        .filter((assignment) => assignment.role === 'cupid')
        .map((assignment) => assignment.participant_id);
    if (phase.stage === 'pack')
      return assignments
        .filter((assignment) => isWerewolfRole(assignment.role))
        .map((assignment) => assignment.participant_id);
    if (phase.stage !== 'night-actions') return [];
    return assignments
      .filter((assignment) => {
        if (
          ['seer', 'doctor', 'guardian', 'little-girl'].includes(
            assignment.role,
          )
        )
          return true;
        if (assignment.role !== 'witch') return false;
        const resources = JSON.parse(assignment.resources_json) as Record<
          string,
          boolean
        >;
        return resources.healPotion || resources.poisonPotion;
      })
      .map((assignment) => assignment.participant_id);
  }

  private recordMissingAbstentions(game: GameRow, phase: PhaseRow): void {
    const submitted = new Set(
      rows<{ participant_id: string }>(
        this.database
          .prepare(
            'SELECT DISTINCT participant_id FROM actions WHERE phase_id = ?',
          )
          .all(phase.id),
      ).map((item) => item.participant_id),
    );
    for (const participantId of this.requiredActorIds(game, phase)) {
      if (!submitted.has(participantId)) {
        this.addEffect(game.id, phase.id, 'abstention', 'final', null, {
          participantId,
          stage: phase.stage,
        });
      }
    }
  }

  private pendingHunterId(phaseId: string): string | null {
    return (
      row<{ participant_id: string }>(
        this.database
          .prepare(
            `SELECT a.participant_id FROM effects e JOIN assignments a
              ON a.game_id = e.game_id
              AND a.participant_id = json_extract(e.data_json, '$.participantId')
            WHERE e.phase_id = ? AND e.effect_type = 'elimination'
              AND a.role = 'hunter' LIMIT 1`,
          )
          .get(phaseId),
      )?.participant_id ?? null
    );
  }

  private pendingHunterForOpenPhase(
    gameId: string,
    phase: PhaseRow,
  ): string | null {
    const source = row<{ id: string }>(
      this.database
        .prepare(
          'SELECT id FROM phases WHERE game_id = ? AND sequence < ? ORDER BY sequence DESC LIMIT 1',
        )
        .get(gameId, phase.sequence),
    );
    return source ? this.pendingHunterId(source.id) : null;
  }

  private getAssignments(gameId: string): AssignmentRow[] {
    return rows<AssignmentRow>(
      this.database
        .prepare(
          'SELECT participant_id, role, alignment, alive, resources_json FROM assignments WHERE game_id = ?',
        )
        .all(gameId),
    );
  }

  private toDomainPlayers(
    assignments: readonly AssignmentRow[],
  ): DomainPlayer[] {
    return assignments.map((assignment) => ({
      id: assignment.participant_id,
      role: assignment.role,
      alive: assignment.alive === 1,
    }));
  }

  private domainPlayers(gameId: string): DomainPlayer[] {
    return this.toDomainPlayers(this.getAssignments(gameId));
  }

  private getLovers(gameId: string): LoverBond | null {
    const effect = row<{ data_json: string }>(
      this.database
        .prepare(
          "SELECT data_json FROM effects WHERE game_id = ? AND effect_type = 'lovers' ORDER BY sequence LIMIT 1",
        )
        .get(gameId),
    );
    if (!effect) return null;
    const players = (JSON.parse(effect.data_json) as { players: string[] })
      .players;
    return players[0] && players[1]
      ? { firstId: players[0], secondId: players[1] }
      : null;
  }

  private personalWinnerIds(gameId: string): string[] {
    return rows<{ participant_id: string }>(
      this.database
        .prepare(
          "SELECT participant_id FROM winners WHERE game_id = ? AND kind = 'personal'",
        )
        .all(gameId),
    ).map((winner) => winner.participant_id);
  }

  private actionTargets(action: Pick<ActionRow, 'targets_json'>): string[] {
    return JSON.parse(action.targets_json) as string[];
  }

  private previousDoctorTarget(
    gameId: string,
    phase: PhaseRow,
    doctorId: string,
  ): string | null {
    const previousNight = row<{ id: string }>(
      this.database
        .prepare(
          `SELECT id FROM phases WHERE game_id = ? AND sequence < ?
            AND kind IN ('first-night', 'night') ORDER BY sequence DESC LIMIT 1`,
        )
        .get(gameId, phase.sequence),
    );
    if (!previousNight) return null;
    const action = row<{ targets_json: string }>(
      this.database
        .prepare(
          "SELECT targets_json FROM actions WHERE phase_id = ? AND participant_id = ? AND action_type = 'doctor-protect'",
        )
        .get(previousNight.id, doctorId),
    );
    return action ? (this.actionTargets(action)[0] ?? null) : null;
  }

  private validateAction(
    game: GameRow,
    phase: PhaseRow,
    assignment: AssignmentRow,
    command: GameCommand,
  ): void {
    const expected = actionByRole[assignment.role];
    const isDayVote = phase.kind === 'voting' && command.action === 'day-vote';
    assert(
      assignment.alive === 1 ||
        (phase.kind === 'hunter-shot' && assignment.role === 'hunter'),
      403,
      'forbidden',
      'Eliminated players cannot act',
    );
    assert(
      isDayVote ||
        command.action === expected ||
        (assignment.role === 'witch' && command.action === 'witch-poison'),
      403,
      'forbidden',
      'That action is not available to this role',
    );
    const nightPhase = phase.kind === 'night' || phase.kind === 'first-night';
    assert(
      isDayVote || nightPhase || phase.kind === 'hunter-shot',
      409,
      'phase_closed',
      'That action is not available in this phase',
    );
    if (nightPhase) {
      const stageAllows =
        (phase.stage === 'cupid' && command.action === 'cupid-link') ||
        (phase.stage === 'pack' && command.action === 'wolf-vote') ||
        (phase.stage === 'night-actions' &&
          command.action !== 'cupid-link' &&
          command.action !== 'wolf-vote');
      assert(
        stageAllows,
        409,
        'phase_closed',
        'That night stage is not accepting this action',
      );
    }
    if (command.action === 'hunter-shoot')
      assert(
        phase.kind === 'hunter-shot',
        409,
        'phase_closed',
        'The hunter is not choosing a shot',
      );
    assert(
      new Set(command.targets).size === command.targets.length,
      400,
      'bad_request',
      'Targets must be unique',
    );
    const required =
      command.action === 'cupid-link'
        ? 2
        : command.action === 'little-girl-spy'
          ? 0
          : 1;
    assert(
      command.targets.length === required || command.targets.length === 0,
      400,
      'bad_request',
      `This action requires ${required} target(s) or an abstention`,
    );
    const players = this.domainPlayers(game.id);
    const target = command.targets[0];
    if (target && command.action === 'wolf-vote')
      this.domain.castWolfVote(
        [],
        { voterId: assignment.participant_id, targetId: target },
        players,
      );
    if (target && command.action === 'day-vote')
      this.domain.castDayVote(
        [],
        { voterId: assignment.participant_id, targetId: target },
        players,
        false,
      );
    if (target && command.action === 'seer-inspect')
      this.domain.inspectAlignment(assignment.participant_id, target, players);
    if (target && command.action === 'guardian-protect')
      this.domain.validateGuardianTarget(
        assignment.participant_id,
        target,
        players,
      );
    if (target && command.action === 'doctor-protect')
      this.domain.validateDoctorTarget(
        assignment.participant_id,
        target,
        this.previousDoctorTarget(game.id, phase, assignment.participant_id),
        players,
      );
    if (command.action === 'cupid-link' && command.targets.length === 2)
      this.domain.createLoverBond(
        assignment.participant_id,
        command.targets[0]!,
        command.targets[1]!,
        players,
      );
    if (target && command.action === 'hunter-shoot') {
      const selected = players.find((player) => player.id === target);
      assert(
        selected?.alive,
        400,
        'bad_request',
        'The hunter must shoot a living player',
      );
    }
    if (assignment.role === 'witch') {
      const resources = JSON.parse(assignment.resources_json) as Record<
        string,
        boolean
      >;
      if (command.targets.length > 0)
        assert(
          command.action === 'witch-heal'
            ? resources.healPotion
            : resources.poisonPotion,
          409,
          'conflict',
          'That potion has already been used',
        );
      const otherPotion = this.database
        .prepare(
          "SELECT 1 FROM actions WHERE phase_id = ? AND participant_id = ? AND action_type IN ('witch-heal', 'witch-poison') AND action_type != ?",
        )
        .get(phase.id, assignment.participant_id, command.action);
      assert(
        !otherPotion,
        409,
        'conflict',
        'The witch can use only one potion per night',
      );
      if (command.action === 'witch-heal' && command.targets.length > 0) {
        assert(
          command.targets[0] === this.currentWolfTarget(game.id),
          409,
          'conflict',
          'The healing potion can only save the current pack target',
        );
      }
      if (command.action === 'witch-poison' && target) {
        const selected = players.find((player) => player.id === target);
        assert(
          selected?.alive && selected.id !== assignment.participant_id,
          400,
          'bad_request',
          'Poison must target another living player',
        );
      }
    }
  }

  private parseCommand(value: unknown): GameCommand {
    assert(
      value && typeof value === 'object',
      400,
      'bad_request',
      'Command body must be an object',
    );
    const candidate = value as Record<string, unknown>;
    const phases = new Set<GamePhase>([
      'first-night',
      'night',
      'dawn',
      'discussion',
      'voting',
      'day-resolution',
      'hunter-shot',
      'finished',
    ]);
    const actions = new Set<GameActionType>([
      'wolf-vote',
      'seer-inspect',
      'witch-heal',
      'witch-poison',
      'doctor-protect',
      'hunter-shoot',
      'cupid-link',
      'guardian-protect',
      'little-girl-spy',
      'day-vote',
    ]);
    assert(
      typeof candidate.commandId === 'string' &&
        /^[A-Za-z0-9_-]{8,128}$/.test(candidate.commandId),
      400,
      'bad_request',
      'Invalid commandId',
    );
    assert(
      Number.isInteger(candidate.expectedVersion) &&
        Number(candidate.expectedVersion) >= 1,
      400,
      'bad_request',
      'Invalid expectedVersion',
    );
    assert(
      phases.has(candidate.expectedPhase as GamePhase),
      400,
      'bad_request',
      'Invalid expectedPhase',
    );
    assert(
      actions.has(candidate.action as GameActionType),
      400,
      'bad_request',
      'Invalid action',
    );
    assert(
      Array.isArray(candidate.targets) &&
        candidate.targets.every((target) => typeof target === 'string'),
      400,
      'bad_request',
      'Invalid targets',
    );
    return {
      commandId: candidate.commandId,
      expectedVersion: Number(candidate.expectedVersion),
      expectedPhase: candidate.expectedPhase as GamePhase,
      action: candidate.action as GameActionType,
      targets: candidate.targets,
    };
  }

  private availableAction(
    game: GameRow,
    assignment: AssignmentRow,
    assignments: AssignmentRow[],
  ): AvailableAction | null {
    if (game.status !== 'active') return null;
    const alive = assignments.filter((item) => item.alive === 1);
    const phase = row<PhaseRow>(
      this.database
        .prepare('SELECT * FROM phases WHERE game_id = ? AND closed_at IS NULL')
        .get(game.id),
    );
    if (!phase) return null;
    if (game.phase === 'voting' && assignment.alive === 1) {
      return {
        type: 'day-vote',
        targets: [
          ...alive
            .filter((item) => item.participant_id !== assignment.participant_id)
            .map((item) => item.participant_id),
        ],
        minTargets: 1,
        maxTargets: 1,
        allowAbstain: true,
      };
    }
    if (
      game.phase === 'hunter-shot' &&
      assignment.role === 'hunter' &&
      assignment.alive === 0 &&
      this.pendingHunterForOpenPhase(game.id, phase) ===
        assignment.participant_id
    ) {
      return {
        type: 'hunter-shoot',
        targets: alive.map((item) => item.participant_id),
        minTargets: 1,
        maxTargets: 1,
        allowAbstain: true,
      };
    }
    if (game.phase !== 'night' && game.phase !== 'first-night') return null;
    if (
      (phase.stage === 'cupid' && assignment.role !== 'cupid') ||
      (phase.stage === 'pack' && !isWerewolfRole(assignment.role)) ||
      (phase.stage === 'night-actions' &&
        (isWerewolfRole(assignment.role) || assignment.role === 'cupid'))
    )
      return null;
    if (assignment.role === 'witch' && assignment.alive === 1) {
      const resources = JSON.parse(assignment.resources_json) as Record<
        string,
        boolean
      >;
      const choices: AvailableAction[] = [];
      const wolfTarget = this.currentWolfTarget(game.id);
      if (resources.healPotion && wolfTarget) {
        choices.push({
          type: 'witch-heal',
          targets: [wolfTarget],
          minTargets: 1,
          maxTargets: 1,
          allowAbstain: true,
        });
      }
      if (resources.poisonPotion) {
        choices.push({
          type: 'witch-poison',
          targets: alive
            .filter((item) => item.participant_id !== assignment.participant_id)
            .map((item) => item.participant_id),
          minTargets: 1,
          maxTargets: 1,
          allowAbstain: true,
        });
      }
      const [primary, ...alternatives] = choices;
      if (!primary && (resources.healPotion || resources.poisonPotion)) {
        return {
          type: resources.healPotion ? 'witch-heal' : 'witch-poison',
          targets: [],
          minTargets: 0,
          maxTargets: 0,
          allowAbstain: true,
        };
      }
      return primary
        ? {
            ...primary,
            ...(alternatives.length > 0 ? { alternatives } : {}),
          }
        : null;
    }
    const type = actionByRole[assignment.role];
    if (
      !type ||
      assignment.alive === 0 ||
      (assignment.role === 'cupid' && game.phase !== 'first-night')
    )
      return null;
    let targets = alive.map((item) => item.participant_id);
    if (type === 'wolf-vote')
      targets = alive
        .filter((item) => !isWerewolfRole(item.role))
        .map((item) => item.participant_id);
    if (type === 'seer-inspect' || type === 'guardian-protect')
      targets = targets.filter((id) => id !== assignment.participant_id);
    if (type === 'doctor-protect') {
      const previous = this.previousDoctorTarget(
        game.id,
        phase,
        assignment.participant_id,
      );
      if (previous) targets = targets.filter((id) => id !== previous);
    }
    if (type === 'little-girl-spy') targets = [];
    const targetCount =
      type === 'cupid-link' ? 2 : type === 'little-girl-spy' ? 0 : 1;
    return {
      type,
      targets,
      minTargets: targetCount,
      maxTargets: targetCount,
      allowAbstain: type !== 'little-girl-spy',
    };
  }

  private currentWolfTarget(gameId: string): string | null {
    const phase = row<{ id: string }>(
      this.database
        .prepare(
          "SELECT id FROM phases WHERE game_id = ? AND closed_at IS NULL AND kind IN ('first-night', 'night')",
        )
        .get(gameId),
    );
    if (!phase) return null;
    return this.wolfTargetForPhase(phase.id);
  }

  private wolfTargetForPhase(phaseId: string): string | null {
    const effect = row<{ data_json: string }>(
      this.database
        .prepare(
          "SELECT data_json FROM effects WHERE phase_id = ? AND effect_type = 'wolf-target-locked' ORDER BY sequence DESC LIMIT 1",
        )
        .get(phaseId),
    );
    return effect
      ? ((JSON.parse(effect.data_json) as { targetId: string | null })
          .targetId ?? null)
      : null;
  }

  private knownPlayers(
    gameId: string,
    assignment: AssignmentRow,
  ): Array<{
    playerId: string;
    fact: KnowledgeFact;
    sourcePlayerId?: string;
  }> {
    const known: Array<{
      playerId: string;
      fact: KnowledgeFact;
      sourcePlayerId?: string;
    }> = [];
    if (isWerewolfRole(assignment.role)) {
      const wolves = rows<{ participant_id: string }>(
        this.database
          .prepare(
            "SELECT participant_id FROM assignments WHERE game_id = ? AND role IN ('werewolf', 'alpha-wolf') AND alive = 1 AND participant_id != ?",
          )
          .all(gameId, assignment.participant_id),
      );
      known.push(
        ...wolves.map((wolf) => ({
          playerId: wolf.participant_id,
          fact: 'werewolf' as const,
        })),
      );
      const packVotes = rows<{
        participant_id: string;
        targets_json: string;
      }>(
        this.database
          .prepare(
            `SELECT actions.participant_id, actions.targets_json
             FROM actions
             JOIN phases ON phases.id = actions.phase_id
             WHERE actions.game_id = ?
               AND actions.action_type = 'wolf-vote'
               AND actions.participant_id != ?
               AND phases.closed_at IS NULL
               AND phases.stage = 'pack'`,
          )
          .all(gameId, assignment.participant_id),
      );
      for (const vote of packVotes) {
        const targetId = (JSON.parse(vote.targets_json) as unknown[])[0];
        if (typeof targetId === 'string') {
          known.push({
            playerId: targetId,
            fact: 'pack-target',
            sourcePlayerId: vote.participant_id,
          });
        }
      }
    }
    if (assignment.role === 'witch') {
      const wolfTarget = this.currentWolfTarget(gameId);
      if (wolfTarget) known.push({ playerId: wolfTarget, fact: 'pack-target' });
    }
    const effects = rows<{ data_json: string }>(
      this.database
        .prepare(
          "SELECT data_json FROM effects WHERE game_id = ? AND visibility = 'private' AND visible_to_participant_id = ? AND effect_type IN ('inspection', 'spy-result', 'spy-detected', 'lover-known') ORDER BY sequence",
        )
        .all(gameId, assignment.participant_id),
    );
    for (const effect of effects) {
      const fact = JSON.parse(effect.data_json) as {
        playerId?: unknown;
        fact?: unknown;
      };
      if (
        typeof fact.playerId === 'string' &&
        typeof fact.fact === 'string' &&
        knowledgeFacts.some((candidate) => candidate === fact.fact)
      ) {
        known.push({
          playerId: fact.playerId,
          fact: fact.fact as KnowledgeFact,
        });
      }
    }
    return [
      ...new Map(
        known.map((fact) => [`${fact.playerId}:${fact.fact}`, fact]),
      ).values(),
    ];
  }

  private publicAnnouncements(
    game: GameRow,
    participants: ParticipantRow[],
  ): string[] {
    const names = new Map(
      participants.map((participant) => [participant.id, participant.nickname]),
    );
    const summarySourceKind =
      game.phase === 'dawn'
        ? ['first-night', 'night']
        : game.phase === 'day-resolution'
          ? ['voting']
          : null;
    const currentPhase = summarySourceKind
      ? row<{ sequence: number }>(
          this.database
            .prepare(
              'SELECT sequence FROM phases WHERE game_id = ? AND closed_at IS NULL',
            )
            .get(game.id),
        )
      : undefined;
    const sourcePhase =
      currentPhase && summarySourceKind
        ? row<{ sequence: number }>(
            this.database
              .prepare(
                `SELECT sequence FROM phases
                 WHERE game_id = ? AND closed_at IS NOT NULL AND sequence < ?
                   AND kind IN (${summarySourceKind.map(() => '?').join(', ')})
                 ORDER BY sequence DESC LIMIT 1`,
              )
              .get(game.id, currentPhase.sequence, ...summarySourceKind),
          )
        : undefined;
    const effects = rows<{
      sequence: number;
      effect_type: string;
      data_json: string;
    }>(
      sourcePhase && currentPhase
        ? this.database
            .prepare(
              `SELECT effects.sequence, effects.effect_type, effects.data_json
               FROM effects
               JOIN phases ON phases.id = effects.phase_id
               WHERE effects.game_id = ? AND effects.visibility = 'public'
                 AND phases.sequence >= ? AND phases.sequence < ?
               ORDER BY effects.sequence`,
            )
            .all(game.id, sourcePhase.sequence, currentPhase.sequence)
        : this.database
            .prepare(
              "SELECT sequence, effect_type, data_json FROM effects WHERE game_id = ? AND visibility = 'public' ORDER BY sequence",
            )
            .all(game.id),
    );
    const noExileReasons: Record<string, string> = {
      'no-exile': 'opção sem expulsão',
      tie: 'empate',
      'no-votes': 'sem votos',
    };
    const winners: Record<string, string> = {
      village: 'da Vila',
      werewolves: 'dos Lobisomens',
      lovers: 'dos Amantes',
    };
    const announcements = effects.flatMap((effect) => {
      const data = JSON.parse(effect.data_json) as {
        participantId?: string;
        cause?: string;
        winner?: string;
        exiledPlayerId?: string | null;
        reason?: string;
      };
      if (effect.effect_type === 'elimination') {
        return data.cause === 'exile'
          ? []
          : [
              game.phase === 'dawn'
                ? dawnDeathAnnouncement(
                    names.get(data.participantId ?? '') ?? 'Um jogador',
                    `${game.id}:${effect.sequence}`,
                  )
                : `${names.get(data.participantId ?? '') ?? 'Um jogador'} foi eliminado.`,
            ];
      }
      if (effect.effect_type === 'no-exile')
        return ['Nenhum jogador foi expulso.'];
      if (effect.effect_type === 'day-vote-result') {
        return [
          data.exiledPlayerId
            ? `${names.get(data.exiledPlayerId) ?? 'Um jogador'} foi expulso.`
            : `Nenhum jogador foi expulso (${noExileReasons[data.reason ?? ''] ?? 'sem resultado'}).`,
        ];
      }
      if (effect.effect_type === 'game-finished')
        return [
          `Partida encerrada: vitória ${winners[data.winner ?? ''] ?? 'com resultado desconhecido'}.`,
        ];
      return ['O estado da partida mudou.'];
    });
    if (game.phase === 'dawn' && announcements.length === 0)
      return [
        dawnNoDeathAnnouncement(
          `${game.id}:${sourcePhase?.sequence ?? game.round}`,
        ),
      ];
    return announcements;
  }

  private startBlockers(
    room: RoomRow,
    participants: ParticipantRow[],
  ): string[] {
    const blockers: string[] = [];
    if (participants.length < 6 || participants.length > 20)
      blockers.push('player-count');
    if (participants.some((participant) => participant.ready !== 1))
      blockers.push('players-not-ready');
    if (
      !participants.some(
        (participant) =>
          participant.is_host === 1 && participant.connected === 1,
      )
    )
      blockers.push('host-disconnected');
    try {
      this.domain.validateComposition(
        participants.length,
        settingsFromRoom(room).specialRoles,
      );
    } catch {
      blockers.push('invalid-composition');
    }
    return blockers;
  }

  private nextPhase(phase: GamePhase): GamePhase {
    if (phase === 'first-night' || phase === 'night' || phase === 'hunter-shot')
      return 'dawn';
    if (phase === 'dawn') return 'discussion';
    if (phase === 'discussion') return 'voting';
    if (phase === 'voting') return 'day-resolution';
    if (phase === 'day-resolution') return 'night';
    return 'finished';
  }

  private addEffect(
    gameId: string,
    phaseId: string | null,
    type: string,
    visibility: 'public' | 'private' | 'final',
    visibleTo: string | null,
    data: object,
  ): void {
    const current = row<{ sequence: number }>(
      this.database
        .prepare(
          'SELECT coalesce(max(sequence), 0) AS sequence FROM effects WHERE game_id = ?',
        )
        .get(gameId),
    );
    this.database
      .prepare(
        `INSERT INTO effects
      (id, game_id, phase_id, sequence, effect_type, visibility, visible_to_participant_id, data_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        gameId,
        phaseId,
        (current?.sequence ?? 0) + 1,
        type,
        visibility,
        visibleTo,
        JSON.stringify(data),
        this.now().toISOString(),
      );
  }

  private getRoom(roomId: string): RoomRow {
    let room = row<RoomRow>(
      this.database
        .prepare('SELECT * FROM rooms WHERE id = ? AND closed_at IS NULL')
        .get(roomId),
    );
    if (room && room.expires_at <= this.now().toISOString()) {
      const now = this.now().toISOString();
      this.database
        .prepare(
          'UPDATE rooms SET closed_at = ? WHERE id = ? AND closed_at IS NULL',
        )
        .run(now, roomId);
      this.database
        .prepare(
          'UPDATE participants SET removed_at = coalesce(removed_at, ?), connected = 0, session_hash = NULL, session_expires_at = NULL WHERE room_id = ?',
        )
        .run(now, roomId);
      room = undefined;
    }
    assert(room, 404, 'not_found', 'Room not found');
    return room;
  }

  private getGame(roomId: string): GameRow {
    const game = row<GameRow>(
      this.database
        .prepare('SELECT * FROM games WHERE room_id = ?')
        .get(roomId),
    );
    assert(game, 409, 'conflict', 'The game has not started');
    return game;
  }

  private getParticipants(roomId: string): ParticipantRow[] {
    return rows<ParticipantRow>(
      this.database
        .prepare(
          'SELECT * FROM participants WHERE room_id = ? AND removed_at IS NULL ORDER BY joined_at, id',
        )
        .all(roomId),
    );
  }

  private nextAvatarId(roomId: string): AvatarId {
    const usage = new Map(
      rows<{ avatar_id: AvatarId; count: number }>(
        this.database
          .prepare(
            `SELECT avatar_id, count(*) AS count FROM participants
             WHERE room_id = ? AND removed_at IS NULL GROUP BY avatar_id`,
          )
          .all(roomId),
      ).map(({ avatar_id, count }) => [avatar_id, count]),
    );
    return avatarIds.reduce((selected, candidate) =>
      (usage.get(candidate) ?? 0) < (usage.get(selected) ?? 0)
        ? candidate
        : selected,
    );
  }

  private closeExpiredRooms(): void {
    const now = this.now().toISOString();
    const expired = rows<{ id: string; code: string }>(
      this.database
        .prepare(
          'SELECT id, code FROM rooms WHERE closed_at IS NULL AND expires_at <= ?',
        )
        .all(now),
    );
    if (expired.length === 0) return;
    inTransaction(this.database, () => {
      for (const room of expired) {
        this.database
          .prepare(
            'UPDATE rooms SET closed_at = ? WHERE id = ? AND closed_at IS NULL',
          )
          .run(now, room.id);
        this.database
          .prepare(
            'UPDATE participants SET removed_at = coalesce(removed_at, ?), connected = 0, session_hash = NULL, session_expires_at = NULL WHERE room_id = ?',
          )
          .run(now, room.id);
      }
    });
    for (const room of expired) this.roomChanged(room.code);
  }

  private resetPresence(): void {
    const roomIds = rows<{ room_id: string }>(
      this.database
        .prepare(
          'SELECT DISTINCT room_id FROM participants WHERE connected = 1',
        )
        .all(),
    ).map((item) => item.room_id);
    if (roomIds.length === 0) return;
    inTransaction(this.database, () => {
      this.database.exec(
        'UPDATE participants SET connected = 0 WHERE connected = 1',
      );
      for (const roomId of roomIds) {
        const game = row<GameRow>(
          this.database
            .prepare(
              "SELECT * FROM games WHERE room_id = ? AND status = 'active'",
            )
            .get(roomId),
        );
        if (game) {
          const version = game.version + 1;
          this.database
            .prepare('UPDATE games SET version = ? WHERE id = ?')
            .run(version, game.id);
          this.database
            .prepare('UPDATE rooms SET version = ? WHERE id = ?')
            .run(version, roomId);
        } else {
          this.database
            .prepare('UPDATE rooms SET version = version + 1 WHERE id = ?')
            .run(roomId);
        }
      }
    });
  }

  private newCredential(): string {
    return randomBytes(32).toString('base64url');
  }

  private hashCredential(credential: string): string {
    return createHmac('sha256', this.sessionSecret)
      .update(credential)
      .digest('hex');
  }

  private sessionExpiry(now: Date): string {
    return new Date(
      now.getTime() + this.sessionTtlSeconds * 1_000,
    ).toISOString();
  }
}
