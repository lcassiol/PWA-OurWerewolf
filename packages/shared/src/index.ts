export const avatarIds = [
  'moon',
  'owl',
  'fox',
  'stag',
  'raven',
  'cat',
  'bat',
  'bear',
  'rabbit',
  'boar',
] as const;

export type AvatarId = (typeof avatarIds)[number];

export const roleIds = [
  'werewolf',
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
] as const;

export type RoleId = (typeof roleIds)[number];
export type Alignment = 'werewolves' | 'village' | 'neutral';
export type RoomStatus = 'lobby' | 'playing' | 'finished';
export type ConnectionStatus = 'connected' | 'disconnected';
export type GamePhase =
  | 'first-night'
  | 'night'
  | 'dawn'
  | 'discussion'
  | 'voting'
  | 'day-resolution'
  | 'hunter-shot'
  | 'finished';

export type PlayerSummary = {
  id: string;
  nickname: string;
  avatarId: AvatarId;
  alive: boolean;
  ready: boolean;
  connection: ConnectionStatus;
  host: boolean;
};

export type RoomSettings = {
  discussionMinutes: number;
  allowNoExile: boolean;
  hideSpecialRoles: boolean;
  showFinalTimeline: boolean;
  specialRoles: RoleId[];
};

export type PublicSnapshot = {
  roomCode: string;
  status: RoomStatus;
  version: number;
  round: number;
  phase: GamePhase | 'lobby';
  deadline: string | null;
  players: PlayerSummary[];
  settings: RoomSettings;
  discussionReadiness: {
    readyCount: number;
    requiredCount: number;
  } | null;
  announcements: string[];
  winner: 'village' | 'werewolves' | 'lovers' | null;
};

export type ActionChoice = {
  type: GameActionType;
  targets: string[];
  minTargets: number;
  maxTargets: number;
  allowAbstain: boolean;
};

export type AvailableAction = ActionChoice & {
  alternatives?: ActionChoice[];
};

export type PrivateSnapshot = {
  playerId: string;
  role: RoleId | null;
  alignment: Alignment | null;
  objective: string | null;
  knownPlayers: Array<{ playerId: string; fact: string }>;
  resources: Record<string, boolean | number | string>;
  availableAction: AvailableAction | null;
  readyForVote: boolean;
  personalWinner: boolean;
};

export type HostSnapshot = {
  canConfigure: boolean;
  canStart: boolean;
  startBlockers: string[];
  configuredSpecialRoles: RoleId[];
};

export type FinalRole = {
  playerId: string;
  nickname: string;
  role: RoleId;
  winner: boolean;
};

export type FinalEvent = {
  sequence: number;
  type: string;
  data: Record<string, unknown>;
};

export type GameSnapshot = {
  public: PublicSnapshot;
  private: PrivateSnapshot;
  host: HostSnapshot | null;
  finalRoles?: FinalRole[];
  finalEvents?: FinalEvent[];
};

export type GameActionType =
  | 'wolf-vote'
  | 'seer-inspect'
  | 'witch-heal'
  | 'witch-poison'
  | 'doctor-protect'
  | 'hunter-shoot'
  | 'cupid-link'
  | 'guardian-protect'
  | 'little-girl-spy'
  | 'day-vote';

export type GameCommand = {
  commandId: string;
  expectedVersion: number;
  expectedPhase: GamePhase;
  action: GameActionType;
  targets: string[];
};

export type ApiErrorCode =
  | 'bad_request'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'stale_command'
  | 'phase_closed';

export type ApiError = {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: Record<string, string | number | boolean>;
  };
};

export type CommandErrorResponse = ApiError & {
  snapshot?: GameSnapshot;
};

export type ServerEvent =
  | { type: 'snapshot'; snapshot: GameSnapshot }
  | { type: 'connection'; status: ConnectionStatus }
  | { type: 'error'; error: ApiError['error'] };

export function isRoleId(value: unknown): value is RoleId {
  return typeof value === 'string' && roleIds.includes(value as RoleId);
}

export function parseRoomSettings(value: unknown): RoomSettings {
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
    !candidate.specialRoles.every(isRoleId)
  ) {
    throw new Error('Invalid settings');
  }
  return {
    discussionMinutes: Number(candidate.discussionMinutes),
    allowNoExile: candidate.allowNoExile,
    hideSpecialRoles: candidate.hideSpecialRoles,
    showFinalTimeline: candidate.showFinalTimeline,
    specialRoles: [...new Set(candidate.specialRoles)],
  };
}
