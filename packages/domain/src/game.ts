import type {
  GameActionType,
  GameCommand,
  GamePhase,
  RoleId,
} from '@our-werewolf/shared';
import {
  DomainRuleError,
  castWolfVote,
  dayVoteWeight,
  earnsFoolVictory,
  resolveDeathChain,
  resolveWitchAction,
  resolveWolfVotes,
  isWerewolfRole,
  roleCatalog,
  validateDoctorTarget,
  validateGuardianTarget,
  type DeathEvent,
  type DomainPlayer,
  type LoverBond,
  type WitchAction,
  type WitchResources,
  type WolfVote,
} from './roles.js';

export const NO_EXILE = 'no-exile' as const;
export type DayVoteTarget = string;
export type DayVote = Readonly<{ voterId: string; targetId: DayVoteTarget }>;

function requirePlayer(
  players: readonly DomainPlayer[],
  playerId: string,
): DomainPlayer {
  const player = players.find(({ id }) => id === playerId);
  if (!player)
    throw new DomainRuleError('unknown-player', `Unknown player: ${playerId}.`);
  return player;
}

export function castDayVote(
  votes: readonly DayVote[],
  vote: DayVote,
  players: readonly DomainPlayer[],
  allowNoExile: boolean,
): DayVote[] {
  const voter = requirePlayer(players, vote.voterId);
  if (!voter.alive)
    throw new DomainRuleError('dead-voter', 'Eliminated players cannot vote.');
  if (vote.targetId === NO_EXILE) {
    if (!allowNoExile)
      throw new DomainRuleError(
        'no-exile-disabled',
        'The no-exile option is disabled.',
      );
  } else {
    const target = requirePlayer(players, vote.targetId);
    if (!target.alive || target.id === voter.id) {
      throw new DomainRuleError(
        'invalid-day-target',
        'A vote must target another living player.',
      );
    }
  }
  return [...votes.filter(({ voterId }) => voterId !== vote.voterId), vote];
}

export type DayVoteResult = Readonly<{
  exiledPlayerId: string | null;
  reason: 'exile' | 'no-exile' | 'tie' | 'no-votes';
  tally: Readonly<Record<string, number>>;
}>;

export function resolveDayVotes(
  votes: readonly DayVote[],
  players: readonly DomainPlayer[],
  allowNoExile: boolean,
): DayVoteResult {
  let accepted: DayVote[] = [];
  for (const vote of votes) {
    if (accepted.some(({ voterId }) => voterId === vote.voterId)) {
      throw new DomainRuleError(
        'duplicate-day-vote',
        'Resolve only the latest vote from each player.',
      );
    }
    accepted = castDayVote(accepted, vote, players, allowNoExile);
  }

  const tally: Record<string, number> = {};
  for (const vote of accepted) {
    const voter = requirePlayer(players, vote.voterId);
    tally[vote.targetId] = (tally[vote.targetId] ?? 0) + dayVoteWeight(voter);
  }
  const entries = Object.entries(tally);
  if (entries.length === 0)
    return { exiledPlayerId: null, reason: 'no-votes', tally };

  const playerEntries = entries.filter(([targetId]) => targetId !== NO_EXILE);
  const highestPlayerVote = Math.max(
    0,
    ...playerEntries.map(([, count]) => count),
  );
  const noExileVotes = tally[NO_EXILE] ?? 0;
  if (allowNoExile && noExileVotes >= highestPlayerVote) {
    return { exiledPlayerId: null, reason: 'no-exile', tally };
  }
  const leaders = playerEntries.filter(
    ([, count]) => count === highestPlayerVote,
  );
  if (leaders.length !== 1)
    return { exiledPlayerId: null, reason: 'tie', tally };
  return { exiledPlayerId: leaders[0]?.[0] ?? null, reason: 'exile', tally };
}

export type MainWinner = 'village' | 'werewolves' | 'lovers';

export type VictoryResult = Readonly<{
  mainWinner: MainWinner;
  winnerIds: readonly string[];
  personalWinnerIds: readonly string[];
}>;

export function evaluateVictory(
  players: readonly DomainPlayer[],
  lovers: LoverBond | null,
  personalWinnerIds: readonly string[] = [],
): VictoryResult | null {
  const living = players.filter(({ alive }) => alive);
  const personal = [...new Set(personalWinnerIds)];
  if (
    lovers &&
    living.length === 2 &&
    living.some(({ id }) => id === lovers.firstId) &&
    living.some(({ id }) => id === lovers.secondId)
  ) {
    return {
      mainWinner: 'lovers',
      winnerIds: [...new Set([lovers.firstId, lovers.secondId, ...personal])],
      personalWinnerIds: personal,
    };
  }

  const livingWerewolves = living.filter(({ role }) =>
    isWerewolfRole(role),
  ).length;
  if (livingWerewolves === 0) {
    const villageWinnerIds = players
      .filter(({ role }) => roleCatalog[role].alignment === 'village')
      .map(({ id }) => id);
    return {
      mainWinner: 'village',
      winnerIds: [...new Set([...villageWinnerIds, ...personal])],
      personalWinnerIds: personal,
    };
  }
  if (livingWerewolves >= living.length - livingWerewolves) {
    const werewolfWinnerIds = players
      .filter(({ role }) => isWerewolfRole(role))
      .map(({ id }) => id);
    return {
      mainWinner: 'werewolves',
      winnerIds: [...new Set([...werewolfWinnerIds, ...personal])],
      personalWinnerIds: personal,
    };
  }
  return null;
}

function applyDeaths(
  players: readonly DomainPlayer[],
  deaths: readonly DeathEvent[],
): DomainPlayer[] {
  const deadIds = new Set(deaths.map(({ playerId }) => playerId));
  return players.map((player) =>
    deadIds.has(player.id) ? { ...player, alive: false } : player,
  );
}

export type DayResolution = Readonly<{
  vote: DayVoteResult;
  deaths: readonly DeathEvent[];
  players: readonly DomainPlayer[];
  personalWinnerIds: readonly string[];
  victory: VictoryResult | null;
}>;

export function resolveDay(
  players: readonly DomainPlayer[],
  votes: readonly DayVote[],
  options: Readonly<{
    allowNoExile: boolean;
    lovers: LoverBond | null;
    hunterShots: Readonly<Record<string, string | null | undefined>>;
    personalWinnerIds: readonly string[];
  }>,
): DayResolution {
  const vote = resolveDayVotes(votes, players, options.allowNoExile);
  const initialDeaths: DeathEvent[] = vote.exiledPlayerId
    ? [{ playerId: vote.exiledPlayerId, cause: 'exile', causedById: null }]
    : [];
  const chain = resolveDeathChain(
    players,
    initialDeaths,
    options.lovers,
    options.hunterShots,
  );
  const resolvedPlayers = applyDeaths(players, chain.deaths);
  const personalWinnerIds = [...new Set(options.personalWinnerIds)];
  for (const death of chain.deaths) {
    const player = requirePlayer(players, death.playerId);
    if (earnsFoolVictory(player.role, death.cause))
      personalWinnerIds.push(player.id);
  }
  const uniquePersonalWinnerIds = [...new Set(personalWinnerIds)];
  return {
    vote,
    deaths: chain.deaths,
    players: resolvedPlayers,
    personalWinnerIds: uniquePersonalWinnerIds,
    victory: evaluateVictory(
      resolvedPlayers,
      options.lovers,
      uniquePersonalWinnerIds,
    ),
  };
}

export type NightEffect =
  | Readonly<{ type: 'wolf-target'; playerId: string }>
  | Readonly<{ type: 'wolf-tie' }>
  | Readonly<{ type: 'witch-heal'; playerId: string }>
  | Readonly<{ type: 'doctor-protect'; playerId: string }>
  | Readonly<{
      type: 'guardian-intercept';
      guardedPlayerId: string;
      guardianId: string;
    }>
  | Readonly<{ type: 'witch-poison'; playerId: string }>;

export type NightResolutionInput = Readonly<{
  players: readonly DomainPlayer[];
  wolfVotes: readonly WolfVote[];
  lockedWolfTargetId?: string | null;
  witchId: string | null;
  witchResources: WitchResources;
  witchAction: WitchAction | null;
  doctorId: string | null;
  doctorTargetId: string | null;
  previousDoctorTargetId: string | null;
  guardianId: string | null;
  guardianTargetId: string | null;
  lovers: LoverBond | null;
  hunterShots: Readonly<Record<string, string | null | undefined>>;
  personalWinnerIds: readonly string[];
}>;

export type NightResolution = Readonly<{
  wolfTargetId: string | null;
  deaths: readonly DeathEvent[];
  players: readonly DomainPlayer[];
  witchResources: WitchResources;
  doctorTargetId: string | null;
  effects: readonly NightEffect[];
  victory: VictoryResult | null;
}>;

export function resolveNight(input: NightResolutionInput): NightResolution {
  if (input.lockedWolfTargetId) {
    const livingWolf = input.players.find(
      ({ alive, role }) => alive && isWerewolfRole(role),
    );
    if (!livingWolf)
      throw new DomainRuleError(
        'missing-werewolf',
        'A locked wolf target requires a living werewolf.',
      );
    castWolfVote(
      [],
      { voterId: livingWolf.id, targetId: input.lockedWolfTargetId },
      input.players,
    );
  }
  const wolfResult =
    input.lockedWolfTargetId === undefined
      ? resolveWolfVotes(input.wolfVotes, input.players)
      : {
          targetId: input.lockedWolfTargetId,
          tied: false,
          tally: {},
        };
  const effects: NightEffect[] = [];
  if (wolfResult.targetId)
    effects.push({ type: 'wolf-target', playerId: wolfResult.targetId });
  else if (wolfResult.tied) effects.push({ type: 'wolf-tie' });

  if (input.doctorTargetId) {
    if (!input.doctorId)
      throw new DomainRuleError(
        'missing-doctor',
        'A doctor target requires a doctor.',
      );
    validateDoctorTarget(
      input.doctorId,
      input.doctorTargetId,
      input.previousDoctorTargetId,
      input.players,
    );
    effects.push({ type: 'doctor-protect', playerId: input.doctorTargetId });
  }
  if (input.guardianTargetId) {
    if (!input.guardianId)
      throw new DomainRuleError(
        'missing-guardian',
        'A guardian target requires a guardian.',
      );
    validateGuardianTarget(
      input.guardianId,
      input.guardianTargetId,
      input.players,
    );
  }

  let witchResources = { ...input.witchResources };
  let healedTargetId: string | null = null;
  let poisonedTargetId: string | null = null;
  if (input.witchAction) {
    if (!input.witchId)
      throw new DomainRuleError(
        'missing-witch',
        'A witch action requires a witch.',
      );
    const witchResult = resolveWitchAction(
      input.witchResources,
      input.witchAction,
      {
        witchId: input.witchId,
        wolfTargetId: wolfResult.targetId,
        players: input.players,
        alreadyActed: false,
      },
    );
    witchResources = witchResult.resources;
    healedTargetId = witchResult.healedTargetId;
    poisonedTargetId = witchResult.poisonedTargetId;
    if (healedTargetId)
      effects.push({ type: 'witch-heal', playerId: healedTargetId });
    if (poisonedTargetId)
      effects.push({ type: 'witch-poison', playerId: poisonedTargetId });
  }

  const initialDeaths: DeathEvent[] = [];
  const wolfTargetId = wolfResult.targetId;
  const attackBlocked =
    wolfTargetId !== null &&
    (healedTargetId === wolfTargetId || input.doctorTargetId === wolfTargetId);
  if (wolfTargetId && !attackBlocked) {
    if (input.guardianId && input.guardianTargetId === wolfTargetId) {
      initialDeaths.push({
        playerId: input.guardianId,
        cause: 'guardian-intercept',
        causedById: null,
      });
      effects.push({
        type: 'guardian-intercept',
        guardedPlayerId: wolfTargetId,
        guardianId: input.guardianId,
      });
    } else {
      initialDeaths.push({
        playerId: wolfTargetId,
        cause: 'wolf-attack',
        causedById: null,
      });
    }
  }
  if (poisonedTargetId) {
    initialDeaths.push({
      playerId: poisonedTargetId,
      cause: 'poison',
      causedById: input.witchId,
    });
  }

  const chain = resolveDeathChain(
    input.players,
    initialDeaths,
    input.lovers,
    input.hunterShots,
  );
  const players = applyDeaths(input.players, chain.deaths);
  return {
    wolfTargetId,
    deaths: chain.deaths,
    players,
    witchResources,
    doctorTargetId: input.doctorTargetId,
    effects,
    victory: evaluateVictory(players, input.lovers, input.personalWinnerIds),
  };
}

export type GameState = Readonly<{
  phase: GamePhase;
  round: number;
  version: number;
  deadlineMs: number | null;
  requiredDecisionPlayerIds: readonly string[];
  completedDecisionPlayerIds: readonly string[];
  lastAbstainedPlayerIds: readonly string[];
  resumePhase: GamePhase | null;
  victory: VictoryResult | null;
}>;

export function createGameState(
  deadlineMs: number | null,
  requiredDecisionPlayerIds: readonly string[] = [],
): GameState {
  return {
    phase: 'first-night',
    round: 1,
    version: 1,
    deadlineMs,
    requiredDecisionPlayerIds: [...new Set(requiredDecisionPlayerIds)],
    completedDecisionPlayerIds: [],
    lastAbstainedPlayerIds: [],
    resumePhase: null,
    victory: null,
  };
}

export function completeDecision(
  state: GameState,
  playerId: string,
): GameState {
  if (!state.requiredDecisionPlayerIds.includes(playerId)) {
    throw new DomainRuleError(
      'decision-not-required',
      'This player has no required decision in the current phase.',
    );
  }
  if (state.completedDecisionPlayerIds.includes(playerId)) return state;
  return {
    ...state,
    completedDecisionPlayerIds: [...state.completedDecisionPlayerIds, playerId],
  };
}

export function canAdvancePhase(state: GameState, nowMs: number): boolean {
  if (state.phase === 'finished') return false;
  const deadlineReached =
    state.deadlineMs !== null && nowMs >= state.deadlineMs;
  const allRequiredComplete =
    state.requiredDecisionPlayerIds.length > 0 &&
    state.requiredDecisionPlayerIds.every((id) =>
      state.completedDecisionPlayerIds.includes(id),
    );
  return deadlineReached || allRequiredComplete || state.phase === 'dawn';
}

function nextPhase(state: GameState): { phase: GamePhase; round: number } {
  switch (state.phase) {
    case 'first-night':
    case 'night':
      return { phase: 'dawn', round: state.round };
    case 'dawn':
      return { phase: 'discussion', round: state.round };
    case 'discussion':
      return { phase: 'voting', round: state.round };
    case 'voting':
      return { phase: 'day-resolution', round: state.round };
    case 'day-resolution':
      return { phase: 'night', round: state.round + 1 };
    case 'hunter-shot':
      if (!state.resumePhase)
        throw new DomainRuleError(
          'missing-resume-phase',
          'Hunter resolution requires a resume phase.',
        );
      return { phase: state.resumePhase, round: state.round };
    case 'finished':
      throw new DomainRuleError(
        'game-finished',
        'A finished game cannot advance.',
      );
    default:
      throw new DomainRuleError(
        'invalid-phase',
        'The game has an invalid phase.',
      );
  }
}

export function advancePhase(
  state: GameState,
  options: Readonly<{
    nowMs: number;
    deadlineMs: number | null;
    requiredDecisionPlayerIds?: readonly string[];
    force?: boolean;
    victory?: VictoryResult | null;
  }>,
): GameState {
  if (state.phase === 'finished')
    throw new DomainRuleError(
      'game-finished',
      'A finished game cannot advance.',
    );
  if (options.victory) {
    return {
      ...state,
      phase: 'finished',
      version: state.version + 1,
      deadlineMs: null,
      requiredDecisionPlayerIds: [],
      completedDecisionPlayerIds: [],
      lastAbstainedPlayerIds: [],
      resumePhase: null,
      victory: options.victory,
    };
  }
  if (!options.force && !canAdvancePhase(state, options.nowMs)) {
    throw new DomainRuleError(
      'phase-not-ready',
      'The phase deadline or required decisions are still pending.',
    );
  }
  const next = nextPhase(state);
  const lastAbstainedPlayerIds = state.requiredDecisionPlayerIds.filter(
    (id) => !state.completedDecisionPlayerIds.includes(id),
  );
  return {
    ...state,
    phase: next.phase,
    round: next.round,
    version: state.version + 1,
    deadlineMs: options.deadlineMs,
    requiredDecisionPlayerIds: [
      ...new Set(options.requiredDecisionPlayerIds ?? []),
    ],
    completedDecisionPlayerIds: [],
    lastAbstainedPlayerIds,
    resumePhase: null,
  };
}

export function enterHunterShotPhase(
  state: GameState,
  hunterId: string,
  resumePhase: Exclude<GamePhase, 'hunter-shot' | 'finished'>,
  deadlineMs: number,
): GameState {
  if (state.phase === 'finished')
    throw new DomainRuleError(
      'game-finished',
      'A finished game cannot open a hunter decision.',
    );
  return {
    ...state,
    phase: 'hunter-shot',
    version: state.version + 1,
    deadlineMs,
    requiredDecisionPlayerIds: [hunterId],
    completedDecisionPlayerIds: [],
    lastAbstainedPlayerIds: [],
    resumePhase,
  };
}

const roleActions: Readonly<Record<RoleId, readonly GameActionType[]>> = {
  werewolf: ['wolf-vote'],
  'alpha-wolf': ['wolf-vote'],
  villager: [],
  hunter: ['hunter-shoot'],
  seer: ['seer-inspect'],
  witch: ['witch-heal', 'witch-poison'],
  doctor: ['doctor-protect'],
  fool: [],
  cupid: ['cupid-link'],
  guardian: ['guardian-protect'],
  mayor: [],
  'little-girl': ['little-girl-spy'],
};

function actionAllowedInPhase(
  action: GameActionType,
  phase: GamePhase,
): boolean {
  if (action === 'day-vote') return phase === 'voting';
  if (action === 'hunter-shoot') return phase === 'hunter-shot';
  if (action === 'cupid-link') return phase === 'first-night';
  return phase === 'first-night' || phase === 'night';
}

export type CommandRejectionCode =
  | 'duplicate-command'
  | 'game-finished'
  | 'stale-version'
  | 'phase-closed'
  | 'unknown-player'
  | 'dead-player'
  | 'action-not-allowed'
  | 'invalid-target';

export type CommandValidation =
  | Readonly<{ accepted: true; duplicate: false }>
  | Readonly<{
      accepted: false;
      duplicate: boolean;
      code: CommandRejectionCode;
    }>;

export type CommandContext = Readonly<{
  version: number;
  phase: GamePhase;
  players: readonly DomainPlayer[];
  processedCommandIds: readonly string[];
  allowNoExile: boolean;
  previousDoctorTargetId: string | null;
  firstNightSetupComplete: boolean;
}>;

function validTargetCount(
  action: GameActionType,
  targets: readonly string[],
): boolean {
  if (action === 'cupid-link')
    return targets.length === 2 && targets[0] !== targets[1];
  if (action === 'witch-heal' || action === 'little-girl-spy')
    return targets.length === 0;
  return targets.length === 1;
}

function targetsAreValid(
  action: GameActionType,
  actor: DomainPlayer,
  targets: readonly string[],
  context: CommandContext,
): boolean {
  if (!validTargetCount(action, targets)) return false;
  if (action === 'witch-heal' || action === 'little-girl-spy') return true;
  if (action === 'day-vote' && targets[0] === NO_EXILE)
    return context.allowNoExile;

  const selected = targets.map((targetId) =>
    context.players.find(({ id }) => id === targetId),
  );
  if (selected.some((target) => !target?.alive)) return false;
  if (action === 'wolf-vote')
    return selected[0] ? !isWerewolfRole(selected[0].role) : false;
  if (action === 'doctor-protect')
    return selected[0]?.id !== context.previousDoctorTargetId;
  if (action === 'cupid-link') return true;
  return selected[0]?.id !== actor.id;
}

export function validateCommand(
  context: CommandContext,
  actorId: string,
  command: GameCommand,
): CommandValidation {
  if (context.processedCommandIds.includes(command.commandId)) {
    return { accepted: false, duplicate: true, code: 'duplicate-command' };
  }
  if (context.phase === 'finished')
    return { accepted: false, duplicate: false, code: 'game-finished' };
  if (command.expectedVersion !== context.version) {
    return { accepted: false, duplicate: false, code: 'stale-version' };
  }
  if (
    command.expectedPhase !== context.phase ||
    !actionAllowedInPhase(command.action, context.phase)
  ) {
    return { accepted: false, duplicate: false, code: 'phase-closed' };
  }
  if (
    context.phase === 'first-night' &&
    command.action !== 'cupid-link' &&
    !context.firstNightSetupComplete
  ) {
    return { accepted: false, duplicate: false, code: 'phase-closed' };
  }
  const actor = context.players.find(({ id }) => id === actorId);
  if (!actor)
    return { accepted: false, duplicate: false, code: 'unknown-player' };
  if (
    !actor.alive &&
    !(actor.role === 'hunter' && command.action === 'hunter-shoot')
  ) {
    return { accepted: false, duplicate: false, code: 'dead-player' };
  }
  const roleCanAct =
    command.action === 'day-vote'
      ? actor.alive
      : roleActions[actor.role].includes(command.action);
  if (!roleCanAct)
    return { accepted: false, duplicate: false, code: 'action-not-allowed' };
  if (!targetsAreValid(command.action, actor, command.targets, context)) {
    return { accepted: false, duplicate: false, code: 'invalid-target' };
  }
  return { accepted: true, duplicate: false };
}

export function rememberProcessedCommand(
  processedCommandIds: readonly string[],
  commandId: string,
): string[] {
  return processedCommandIds.includes(commandId)
    ? [...processedCommandIds]
    : [...processedCommandIds, commandId];
}
