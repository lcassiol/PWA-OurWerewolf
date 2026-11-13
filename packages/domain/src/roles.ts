import type { Alignment, GameActionType, RoleId } from '@our-werewolf/shared';

export type { Alignment, RoleId } from '@our-werewolf/shared';

export class DomainRuleError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'DomainRuleError';
  }
}

function assertRule(
  condition: unknown,
  code: string,
  message: string,
): asserts condition {
  if (!condition) throw new DomainRuleError(code, message);
}

export type RandomSource = () => number;

export type RoleDefinition = Readonly<{
  id: RoleId;
  name: string;
  alignment: Alignment;
  summary: string;
  objective: string;
  actions: readonly GameActionType[];
}>;

export const roleCatalog: Readonly<Record<RoleId, RoleDefinition>> = {
  werewolf: {
    id: 'werewolf',
    name: 'Lobisomem',
    alignment: 'werewolves',
    summary:
      'Conhece os aliados vivos, vota em uma vítima à noite e tenta desviar as suspeitas durante o dia.',
    objective:
      'Iguale ou supere em número todos os outros jogadores sobreviventes.',
    actions: ['wolf-vote'],
  },
  'alpha-wolf': {
    id: 'alpha-wolf',
    name: 'Lobo Alfa',
    alignment: 'werewolves',
    summary:
      'Age com a alcateia à noite, mas parece pertencer à Cidade quando é investigado pela Vidente.',
    objective:
      'Iguale ou supere em número todos os outros jogadores sobreviventes.',
    actions: ['wolf-vote'],
  },
  villager: {
    id: 'villager',
    name: 'Aldeão',
    alignment: 'village',
    summary:
      'Não age à noite; observa, discute e vota para encontrar os Lobisomens durante o dia.',
    objective: 'Elimine todos os Lobisomens.',
    actions: [],
  },
  hunter: {
    id: 'hunter',
    name: 'Caçador',
    alignment: 'village',
    summary:
      'Joga pela Cidade e, ao morrer, recebe uma última chance de eliminar outro sobrevivente.',
    objective: 'Elimine todos os Lobisomens.',
    actions: ['hunter-shoot'],
  },
  seer: {
    id: 'seer',
    name: 'Vidente',
    alignment: 'village',
    summary:
      'Investiga outra pessoa viva por noite e descobre privadamente seu alinhamento.',
    objective: 'Elimine todos os Lobisomens.',
    actions: ['seer-inspect'],
  },
  witch: {
    id: 'witch',
    name: 'Bruxa',
    alignment: 'village',
    summary:
      'Possui uma cura e um veneno para toda a partida, podendo usar no máximo uma poção por noite.',
    objective: 'Elimine todos os Lobisomens.',
    actions: ['witch-heal', 'witch-poison'],
  },
  doctor: {
    id: 'doctor',
    name: 'Médico',
    alignment: 'village',
    summary:
      'Protege uma pessoa viva do ataque da alcateia, sem repetir o alvo em noites consecutivas.',
    objective: 'Elimine todos os Lobisomens.',
    actions: ['doctor-protect'],
  },
  fool: {
    id: 'fool',
    name: 'Bobo',
    alignment: 'neutral',
    summary:
      'Não age à noite e busca uma vitória pessoal convencendo a vila a expulsá-lo na votação.',
    objective: 'Seja expulso pela vila durante o dia.',
    actions: [],
  },
  cupid: {
    id: 'cupid',
    name: 'Cupido',
    alignment: 'village',
    summary:
      'Une duas pessoas vivas como amantes na primeira noite e depois joga pela Cidade.',
    objective:
      'Elimine todos os Lobisomens, a menos que os amantes sejam o último par.',
    actions: ['cupid-link'],
  },
  guardian: {
    id: 'guardian',
    name: 'Guardião',
    alignment: 'village',
    summary:
      'Guarda outra pessoa à noite e morre no lugar dela se interceptar o ataque da alcateia.',
    objective: 'Elimine todos os Lobisomens.',
    actions: ['guardian-protect'],
  },
  mayor: {
    id: 'mayor',
    name: 'Prefeito',
    alignment: 'village',
    summary:
      'Não possui botão especial; enquanto estiver vivo, seu voto diurno confirmado vale dois em segredo.',
    objective: 'Elimine todos os Lobisomens.',
    actions: [],
  },
  'little-girl': {
    id: 'little-girl',
    name: 'Menina',
    alignment: 'village',
    summary:
      'Espiona sem escolher alvo e descobre um Lobisomem vivo aleatório, com 25% de risco de ser detectada.',
    objective: 'Elimine todos os Lobisomens.',
    actions: ['little-girl-spy'],
  },
};

export const specialRoleIds = [
  'alpha-wolf',
  'hunter',
  'seer',
  'witch',
  'doctor',
  'fool',
  'cupid',
  'guardian',
  'mayor',
  'little-girl',
] as const satisfies readonly RoleId[];

const specialRoleSet = new Set<RoleId>(specialRoleIds);

export function isWerewolfRole(role: RoleId): boolean {
  return roleCatalog[role].alignment === 'werewolves';
}

export type DomainPlayer = Readonly<{
  id: string;
  role: RoleId;
  alive: boolean;
}>;

export function getWerewolfCount(playerCount: number): number {
  assertRule(
    Number.isInteger(playerCount) && playerCount >= 6 && playerCount <= 20,
    'invalid-player-count',
    'A game requires between 6 and 20 players.',
  );
  if (playerCount <= 8) return 1;
  if (playerCount <= 12) return 2;
  if (playerCount <= 16) return 3;
  return 4;
}

export function buildRoleComposition(
  playerCount: number,
  enabledSpecialRoles: readonly RoleId[],
): RoleId[] {
  const werewolfCount = getWerewolfCount(playerCount);
  const uniqueRoles = new Set(enabledSpecialRoles);
  assertRule(
    uniqueRoles.size === enabledSpecialRoles.length,
    'duplicate-special-role',
    'Special roles can only appear once.',
  );
  for (const role of enabledSpecialRoles) {
    assertRule(
      specialRoleSet.has(role),
      'invalid-special-role',
      `${role} is not a configurable special role.`,
    );
  }

  const villagerCount =
    playerCount - werewolfCount - enabledSpecialRoles.length;
  assertRule(
    villagerCount >= 1,
    'villager-required',
    'Remove at least one special role to leave room for a villager.',
  );
  return [
    ...Array<RoleId>(werewolfCount).fill('werewolf'),
    ...enabledSpecialRoles,
    ...Array<RoleId>(villagerCount).fill('villager'),
  ];
}

function drawRandom(random: RandomSource): number {
  const value = random();
  assertRule(
    Number.isFinite(value) && value >= 0 && value < 1,
    'invalid-random-value',
    'Random sources must return values in [0, 1).',
  );
  return value;
}

export function shuffle<T>(values: readonly T[], random: RandomSource): T[] {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(drawRandom(random) * (index + 1));
    const current = shuffled[index];
    shuffled[index] = shuffled[swapIndex] as T;
    shuffled[swapIndex] = current as T;
  }
  return shuffled;
}

export type RoleAssignment = Readonly<{ playerId: string; role: RoleId }>;

export function assignRoles(
  playerIds: readonly string[],
  composition: readonly RoleId[],
  random: RandomSource,
): RoleAssignment[] {
  assertRule(
    playerIds.length === composition.length,
    'assignment-size-mismatch',
    'Players and roles must have the same length.',
  );
  assertRule(
    new Set(playerIds).size === playerIds.length,
    'duplicate-player',
    'Each player can receive only one role.',
  );
  return shuffle(composition, random).map((role, index) => ({
    playerId: playerIds[index] as string,
    role,
  }));
}

function playerById(
  players: readonly DomainPlayer[],
  playerId: string,
): DomainPlayer {
  const player = players.find(({ id }) => id === playerId);
  assertRule(player, 'unknown-player', `Unknown player: ${playerId}.`);
  return player;
}

export type WolfVote = Readonly<{ voterId: string; targetId: string }>;

export function knownLivingWerewolves(
  werewolfId: string,
  players: readonly DomainPlayer[],
): string[] {
  const werewolf = playerById(players, werewolfId);
  assertRule(
    werewolf.alive && isWerewolfRole(werewolf.role),
    'invalid-werewolf',
    'Only a living werewolf knows the living pack.',
  );
  return players
    .filter(
      ({ id, role, alive }) =>
        id !== werewolfId && isWerewolfRole(role) && alive,
    )
    .map(({ id }) => id);
}

export function castWolfVote(
  votes: readonly WolfVote[],
  vote: WolfVote,
  players: readonly DomainPlayer[],
): WolfVote[] {
  const voter = playerById(players, vote.voterId);
  const target = playerById(players, vote.targetId);
  assertRule(
    voter.alive && isWerewolfRole(voter.role),
    'invalid-wolf-voter',
    'Only a living werewolf can vote.',
  );
  assertRule(
    target.alive && !isWerewolfRole(target.role),
    'invalid-wolf-target',
    'The pack must target a living non-werewolf.',
  );
  return [...votes.filter(({ voterId }) => voterId !== vote.voterId), vote];
}

export type WolfVoteResult = Readonly<{
  targetId: string | null;
  tied: boolean;
  tally: Readonly<Record<string, number>>;
}>;

export function resolveWolfVotes(
  votes: readonly WolfVote[],
  players: readonly DomainPlayer[],
  random: RandomSource = Math.random,
): WolfVoteResult {
  let accepted: WolfVote[] = [];
  for (const vote of votes) {
    assertRule(
      !accepted.some(({ voterId }) => voterId === vote.voterId),
      'duplicate-wolf-vote',
      'Resolve only the latest vote from each werewolf.',
    );
    accepted = castWolfVote(accepted, vote, players);
  }
  const tally: Record<string, number> = {};
  for (const { targetId } of accepted)
    tally[targetId] = (tally[targetId] ?? 0) + 1;
  const highest = Math.max(0, ...Object.values(tally));
  const leaders = Object.keys(tally).filter(
    (targetId) => tally[targetId] === highest,
  );
  return {
    targetId:
      leaders.length === 0
        ? null
        : leaders.length === 1
          ? (leaders[0] as string)
          : (leaders[
              Math.floor(drawRandom(random) * leaders.length)
            ] as string),
    tied: leaders.length > 1,
    tally,
  };
}

export function inspectAlignment(
  seerId: string,
  targetId: string,
  players: readonly DomainPlayer[],
): Alignment {
  const seer = playerById(players, seerId);
  const target = playerById(players, targetId);
  assertRule(
    seer.alive && seer.role === 'seer',
    'invalid-seer',
    'Only a living seer can inspect.',
  );
  assertRule(
    target.alive && target.id !== seer.id,
    'invalid-seer-target',
    'The seer must inspect another living player.',
  );
  return target.role === 'alpha-wolf'
    ? 'village'
    : roleCatalog[target.role].alignment;
}

export function dayVoteWeight(player: DomainPlayer): number {
  return player.alive && player.role === 'mayor' ? 2 : player.alive ? 1 : 0;
}

export type WitchResources = Readonly<{
  healingPotion: boolean;
  poisonPotion: boolean;
}>;

export const initialWitchResources: WitchResources = {
  healingPotion: true,
  poisonPotion: true,
};

export type WitchAction =
  | Readonly<{ kind: 'heal' }>
  | Readonly<{ kind: 'poison'; targetId: string }>
  | Readonly<{ kind: 'abstain' }>;

export type WitchActionResult = Readonly<{
  resources: WitchResources;
  healedTargetId: string | null;
  poisonedTargetId: string | null;
}>;

export function resolveWitchAction(
  resources: WitchResources,
  action: WitchAction,
  context: Readonly<{
    witchId: string;
    wolfTargetId: string | null;
    players: readonly DomainPlayer[];
    alreadyActed: boolean;
  }>,
): WitchActionResult {
  assertRule(
    !context.alreadyActed,
    'witch-already-acted',
    'The witch can use at most one potion per night.',
  );
  const witch = playerById(context.players, context.witchId);
  assertRule(
    witch.alive && witch.role === 'witch',
    'invalid-witch',
    'Only a living witch can act.',
  );

  if (action.kind === 'abstain') {
    return {
      resources: { ...resources },
      healedTargetId: null,
      poisonedTargetId: null,
    };
  }
  if (action.kind === 'heal') {
    assertRule(
      resources.healingPotion,
      'healing-potion-used',
      'The healing potion is no longer available.',
    );
    assertRule(
      context.wolfTargetId,
      'no-wolf-target',
      'There is no pack target to heal.',
    );
    return {
      resources: { ...resources, healingPotion: false },
      healedTargetId: context.wolfTargetId,
      poisonedTargetId: null,
    };
  }

  assertRule(
    resources.poisonPotion,
    'poison-potion-used',
    'The poison potion is no longer available.',
  );
  const target = playerById(context.players, action.targetId);
  assertRule(
    target.alive && target.id !== witch.id,
    'invalid-poison-target',
    'Poison must target another living player.',
  );
  return {
    resources: { ...resources, poisonPotion: false },
    healedTargetId: null,
    poisonedTargetId: target.id,
  };
}

export function validateDoctorTarget(
  doctorId: string,
  targetId: string,
  previousTargetId: string | null,
  players: readonly DomainPlayer[],
): void {
  const doctor = playerById(players, doctorId);
  const target = playerById(players, targetId);
  assertRule(
    doctor.alive && doctor.role === 'doctor',
    'invalid-doctor',
    'Only a living doctor can protect.',
  );
  assertRule(
    target.alive,
    'invalid-doctor-target',
    'The doctor must protect a living player.',
  );
  assertRule(
    target.id !== previousTargetId,
    'repeated-doctor-target',
    'The doctor cannot protect the same target on consecutive nights.',
  );
}

export function validateGuardianTarget(
  guardianId: string,
  targetId: string,
  players: readonly DomainPlayer[],
): void {
  const guardian = playerById(players, guardianId);
  const target = playerById(players, targetId);
  assertRule(
    guardian.alive && guardian.role === 'guardian',
    'invalid-guardian',
    'Only a living guardian can guard.',
  );
  assertRule(
    target.alive && target.id !== guardian.id,
    'invalid-guardian-target',
    'The guardian must guard another living player.',
  );
}

export type LoverBond = Readonly<{ firstId: string; secondId: string }>;

export function createLoverBond(
  cupidId: string,
  firstId: string,
  secondId: string,
  players: readonly DomainPlayer[],
): LoverBond {
  const cupid = playerById(players, cupidId);
  const first = playerById(players, firstId);
  const second = playerById(players, secondId);
  assertRule(
    cupid.alive && cupid.role === 'cupid',
    'invalid-cupid',
    'Only a living cupid can link lovers.',
  );
  assertRule(
    first.alive && second.alive && first.id !== second.id,
    'invalid-lovers',
    'Cupid must choose two distinct living players.',
  );
  return { firstId: first.id, secondId: second.id };
}

export type DeathCause =
  | 'wolf-attack'
  | 'poison'
  | 'guardian-intercept'
  | 'hunter-shot'
  | 'lover'
  | 'exile';

export type DeathEvent = Readonly<{
  playerId: string;
  cause: DeathCause;
  causedById: string | null;
}>;

export type DeathChainResult = Readonly<{
  deaths: readonly DeathEvent[];
  survivors: readonly string[];
}>;

export function resolveDeathChain(
  players: readonly DomainPlayer[],
  initialDeaths: readonly DeathEvent[],
  lovers: LoverBond | null,
  hunterShots: Readonly<Record<string, string | null | undefined>> = {},
): DeathChainResult {
  const alive = new Set(
    players.filter(({ alive: isAlive }) => isAlive).map(({ id }) => id),
  );
  const queue = [...initialDeaths];
  const deaths: DeathEvent[] = [];

  while (queue.length > 0) {
    const death = queue.shift() as DeathEvent;
    if (!alive.delete(death.playerId)) continue;
    const player = playerById(players, death.playerId);
    deaths.push(death);

    if (player.role === 'hunter' && Object.hasOwn(hunterShots, player.id)) {
      const targetId = hunterShots[player.id];
      if (targetId !== null && targetId !== undefined) {
        assertRule(
          alive.has(targetId),
          'invalid-hunter-target',
          'The hunter must shoot a living player.',
        );
        queue.push({
          playerId: targetId,
          cause: 'hunter-shot',
          causedById: player.id,
        });
      }
    }

    if (lovers) {
      const loverId =
        lovers.firstId === player.id
          ? lovers.secondId
          : lovers.secondId === player.id
            ? lovers.firstId
            : null;
      if (loverId && alive.has(loverId)) {
        queue.push({
          playerId: loverId,
          cause: 'lover',
          causedById: player.id,
        });
      }
    }
  }

  return { deaths, survivors: [...alive] };
}

export function earnsFoolVictory(role: RoleId, cause: DeathCause): boolean {
  return role === 'fool' && cause === 'exile';
}

export type LittleGirlSpyResult = Readonly<{
  littleGirlId: string;
  revealedWerewolfId: string | null;
  detected: boolean;
  revealedToWerewolfIds: readonly string[];
  randomFact: Readonly<{
    wolfIndex: number | null;
    detectionRoll: number | null;
  }>;
}>;

export function resolveLittleGirlSpy(
  littleGirlId: string,
  players: readonly DomainPlayer[],
  random: RandomSource,
): LittleGirlSpyResult {
  const littleGirl = playerById(players, littleGirlId);
  assertRule(
    littleGirl.alive && littleGirl.role === 'little-girl',
    'invalid-little-girl',
    'Only the living little girl can spy.',
  );
  const livingWerewolves = players.filter(
    ({ alive, role }) => alive && isWerewolfRole(role),
  );
  if (livingWerewolves.length === 0) {
    return {
      littleGirlId,
      revealedWerewolfId: null,
      detected: false,
      revealedToWerewolfIds: [],
      randomFact: { wolfIndex: null, detectionRoll: null },
    };
  }

  const wolfIndex = Math.floor(drawRandom(random) * livingWerewolves.length);
  const detectionRoll = drawRandom(random);
  const detected = detectionRoll < 0.25;
  return {
    littleGirlId,
    revealedWerewolfId: (livingWerewolves[wolfIndex] as DomainPlayer).id,
    detected,
    revealedToWerewolfIds: detected ? livingWerewolves.map(({ id }) => id) : [],
    randomFact: { wolfIndex, detectionRoll },
  };
}
