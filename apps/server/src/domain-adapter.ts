import { randomInt } from 'node:crypto';
import {
  assignRoles as assignDomainRoles,
  buildRoleComposition,
  castDayVote,
  castWolfVote,
  createLoverBond,
  evaluateVictory,
  getWerewolfCount,
  initialWitchResources,
  inspectAlignment,
  resolveDay,
  resolveDeathChain,
  resolveLittleGirlSpy,
  resolveNight,
  resolveWolfVotes,
  roleCatalog,
  validateDoctorTarget,
  validateGuardianTarget,
  type DayResolution,
  type DayVote,
  type DeathChainResult,
  type DeathEvent,
  type DomainPlayer,
  type LoverBond,
  type NightResolution,
  type NightResolutionInput,
  type VictoryResult,
  type WitchAction,
  type WitchResources,
  type WolfVote,
} from '@our-werewolf/domain';
import type { Alignment, RoleId } from './contracts.js';
import { HttpError } from './errors.js';

export type DomainAdapter = {
  validateComposition(playerCount: number, specialRoles: RoleId[]): RoleId[];
  assignRoles(
    participantIds: string[],
    composition: RoleId[],
  ): Array<{ participantId: string; role: RoleId }>;
  alignment(role: RoleId): Alignment;
  objective(role: RoleId): string;
  castWolfVote(
    votes: readonly WolfVote[],
    vote: WolfVote,
    players: readonly DomainPlayer[],
  ): WolfVote[];
  resolveWolfVotes(
    votes: readonly WolfVote[],
    players: readonly DomainPlayer[],
  ): {
    targetId: string | null;
    tied: boolean;
    tally: Readonly<Record<string, number>>;
  };
  castDayVote(
    votes: readonly DayVote[],
    vote: DayVote,
    players: readonly DomainPlayer[],
    allowNoExile: boolean,
  ): DayVote[];
  resolveNight(input: NightResolutionInput): NightResolution;
  resolveDay(
    players: readonly DomainPlayer[],
    votes: readonly DayVote[],
    options: Parameters<typeof resolveDay>[2],
  ): DayResolution;
  resolveDeathChain(
    players: readonly DomainPlayer[],
    deaths: readonly DeathEvent[],
    lovers: LoverBond | null,
  ): DeathChainResult;
  evaluateVictory(
    players: readonly DomainPlayer[],
    lovers: LoverBond | null,
    personalWinnerIds: readonly string[],
  ): VictoryResult | null;
  createLoverBond(
    cupidId: string,
    firstId: string,
    secondId: string,
    players: readonly DomainPlayer[],
  ): LoverBond;
  inspectAlignment(
    seerId: string,
    targetId: string,
    players: readonly DomainPlayer[],
  ): Alignment;
  resolveLittleGirlSpy(
    littleGirlId: string,
    players: readonly DomainPlayer[],
  ): ReturnType<typeof resolveLittleGirlSpy>;
  validateDoctorTarget(
    doctorId: string,
    targetId: string,
    previousTargetId: string | null,
    players: readonly DomainPlayer[],
  ): void;
  validateGuardianTarget(
    guardianId: string,
    targetId: string,
    players: readonly DomainPlayer[],
  ): void;
};

export function werewolfCount(playerCount: number): number {
  try {
    return getWerewolfCount(playerCount);
  } catch (error) {
    throw domainError(error);
  }
}

function domainError(error: unknown): HttpError {
  return new HttpError(
    409,
    'conflict',
    error instanceof Error ? error.message : 'Invalid game action',
  );
}

function callDomain<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    throw domainError(error);
  }
}

export function createDomainAdapter(
  nextInt: (maxExclusive: number) => number = randomInt,
): DomainAdapter {
  return {
    validateComposition(playerCount, specialRoles) {
      try {
        return buildRoleComposition(playerCount, specialRoles);
      } catch (error) {
        throw new HttpError(
          409,
          'conflict',
          error instanceof Error ? error.message : 'Invalid role composition',
        );
      }
    },
    assignRoles(participantIds, composition) {
      return assignDomainRoles(
        participantIds,
        composition,
        () => nextInt(0x1_0000_0000) / 0x1_0000_0000,
      ).map(({ playerId, role }) => ({ participantId: playerId, role }));
    },
    alignment(role) {
      return roleCatalog[role].alignment;
    },
    objective(role) {
      return roleCatalog[role].objective;
    },
    castWolfVote: (votes, vote, players) =>
      callDomain(() => castWolfVote(votes, vote, players)),
    resolveWolfVotes: (votes, players) =>
      callDomain(() => resolveWolfVotes(votes, players)),
    castDayVote: (votes, vote, players, allowNoExile) =>
      callDomain(() => castDayVote(votes, vote, players, allowNoExile)),
    resolveNight: (input) => callDomain(() => resolveNight(input)),
    resolveDay: (players, votes, options) =>
      callDomain(() => resolveDay(players, votes, options)),
    resolveDeathChain: (players, deaths, lovers) =>
      callDomain(() => resolveDeathChain(players, deaths, lovers)),
    evaluateVictory: (players, lovers, personalWinnerIds) =>
      callDomain(() => evaluateVictory(players, lovers, personalWinnerIds)),
    createLoverBond: (cupidId, firstId, secondId, players) =>
      callDomain(() => createLoverBond(cupidId, firstId, secondId, players)),
    inspectAlignment: (seerId, targetId, players) =>
      callDomain(() => inspectAlignment(seerId, targetId, players)),
    resolveLittleGirlSpy: (littleGirlId, players) =>
      callDomain(() =>
        resolveLittleGirlSpy(
          littleGirlId,
          players,
          () => nextInt(0x1_0000_0000) / 0x1_0000_0000,
        ),
      ),
    validateDoctorTarget: (doctorId, targetId, previousTargetId, players) =>
      callDomain(() =>
        validateDoctorTarget(doctorId, targetId, previousTargetId, players),
      ),
    validateGuardianTarget: (guardianId, targetId, players) =>
      callDomain(() => validateGuardianTarget(guardianId, targetId, players)),
  };
}

export function initialResources(
  role: RoleId,
): Record<string, boolean | number | string> {
  if (role === 'witch') {
    return {
      healPotion: initialWitchResources.healingPotion,
      poisonPotion: initialWitchResources.poisonPotion,
    };
  }
  return {};
}

export function objective(role: RoleId): string {
  return roleCatalog[role].objective;
}

export function toWitchResources(
  resources: Record<string, boolean | number | string>,
): WitchResources {
  return {
    healingPotion: resources.healPotion === true,
    poisonPotion: resources.poisonPotion === true,
  };
}

export function fromWitchResources(
  resources: WitchResources,
): Record<string, boolean> {
  return {
    healPotion: resources.healingPotion,
    poisonPotion: resources.poisonPotion,
  };
}

export type { DomainPlayer, LoverBond, VictoryResult, WitchAction };
