import type { GameActionType, GamePhase, RoleId } from '@our-werewolf/shared';

export type RoleDetails = {
  name: string;
  short: string;
  objective: string;
  targeting: string;
  rules: string[];
  mark: string;
};

export const gameRuleCatalog: {
  roles: Record<RoleId, RoleDetails>;
  resolutionPriority: string[];
  specialVictories: string[];
} = {
  roles: {
    werewolf: {
      name: 'Lobisomem',
      short: 'Vota com a alcateia em uma vítima a cada noite.',
      objective: 'Iguale ou supere em número todos os outros sobreviventes.',
      targeting: 'Escolha uma pessoa viva que não seja Lobisomem.',
      rules: [
        'Os Lobisomens vivos conhecem uns aos outros e votam em segredo.',
        'Somente uma maioria única produz ataque; empate ou ausência de votos não ataca ninguém.',
        'A alcateia vence quando seus sobreviventes igualam ou superam todos os demais, salvo uma vitória especial anterior.',
      ],
      mark: 'L',
    },
    villager: {
      name: 'Aldeão',
      short: 'Observa, discute e vota durante o dia.',
      objective: 'Ajude a Cidade a eliminar todos os Lobisomens.',
      targeting:
        'Não possui alvo noturno; durante o dia vota em outra pessoa viva.',
      rules: [
        'Aguarda o amanhecer sem ação própria durante a noite.',
        'A Cidade vence quando nenhum Lobisomem permanece vivo, salvo uma vitória especial anterior.',
      ],
      mark: 'A',
    },
    hunter: {
      name: 'Caçador',
      short: 'Ao morrer, pode levar uma pessoa viva consigo.',
      objective: 'Proteja a Cidade e use seu último disparo com sabedoria.',
      targeting:
        'Depois de morrer, pode escolher uma pessoa que ainda esteja viva.',
      rules: [
        'Se o prazo acabar sem escolha, o disparo é perdido.',
        'A morte do alvo e todas as mortes decorrentes são resolvidas antes da verificação de vitória.',
      ],
      mark: 'C',
    },
    seer: {
      name: 'Vidente',
      short: 'Descobre o alinhamento de uma pessoa por noite.',
      objective:
        'Encontre os Lobisomens sem revelar sua identidade cedo demais.',
      targeting:
        'Escolha outra pessoa viva; a Vidente não pode inspecionar a si mesma.',
      rules: [
        'O resultado revela apenas o alinhamento atual: Lobisomens, Cidade ou Neutro.',
        'A descoberta permanece privada para a Vidente.',
      ],
      mark: 'V',
    },
    witch: {
      name: 'Bruxa',
      short: 'Possui uma cura e um veneno, usados uma vez cada.',
      objective: 'Mude o destino da noite a favor da Cidade.',
      targeting:
        'A cura alcança o alvo atual da alcateia; o veneno exige outra pessoa viva.',
      rules: [
        'Cada poção pode ser usada uma única vez na partida e somente uma das duas pode ser confirmada por noite.',
        'A cura cancela o ataque antes da possível interceptação do Guardião; o veneno é dano letal separado.',
      ],
      mark: 'B',
    },
    doctor: {
      name: 'Médico',
      short: 'Protege uma pessoa do ataque, sem repetir o alvo.',
      objective: 'Mantenha a Cidade viva durante a noite.',
      targeting:
        'Escolha qualquer pessoa viva, inclusive você, exceto o alvo da noite anterior.',
      rules: [
        'A proteção impede somente o ataque da alcateia.',
        'Veneno e mortes derivadas atravessam a proteção; um ataque bloqueado não aciona o Guardião.',
      ],
      mark: 'M',
    },
    fool: {
      name: 'Bobo',
      short: 'Vence pessoalmente se for expulso pela votação.',
      objective: 'Convença a vila a expulsar você durante o dia.',
      targeting:
        'Não possui habilidade com alvo; participa da votação enquanto estiver vivo.',
      rules: [
        'Apenas a expulsão pelo voto concede sua vitória pessoal; outras causas de morte não concedem.',
        'Sua vitória é adicional e não encerra a disputa principal.',
      ],
      mark: 'B',
    },
    cupid: {
      name: 'Cupido',
      short: 'Liga duas pessoas como amantes na primeira noite.',
      objective: 'Ajude a Cidade, atento ao destino inseparável do casal.',
      targeting:
        'Na primeira noite, escolha duas pessoas vivas e distintas; você pode ser uma delas.',
      rules: [
        'Cada amante conhece somente a identidade do outro.',
        'Quando um amante morre, o outro morre em seguida; a cadeia inteira termina antes da vitória ser avaliada.',
        'Se forem os dois últimos sobreviventes, vencem juntos antes das condições da Cidade ou dos Lobisomens.',
      ],
      mark: 'C',
    },
    guardian: {
      name: 'Guardião',
      short: 'Morre no lugar de quem guarda contra a alcateia.',
      objective: 'Intercepte o ataque certo para proteger a vila.',
      targeting:
        'Escolha outra pessoa viva; o Guardião não pode guardar a si mesmo.',
      rules: [
        'Só intercepta um ataque da alcateia que ainda exista após cura e proteção do Médico.',
        'Não intercepta veneno nem mortes derivadas e morre no lugar do alvo guardado.',
      ],
      mark: 'G',
    },
    mayor: {
      name: 'Prefeito',
      short: 'Seu voto diurno secreto vale por dois.',
      objective: 'Conduza a votação para livrar a Cidade dos Lobisomens.',
      targeting:
        'Segue as opções normais da votação diurna enquanto estiver vivo.',
      rules: [
        'Seu último voto confirmado vale dois, sem revelar publicamente de onde veio o peso extra.',
        'A identidade do Prefeito continua secreta até uma revelação geral.',
      ],
      mark: 'P',
    },
    'little-girl': {
      name: 'Menina',
      short: 'Pode espiar a alcateia, com 25% de risco de ser vista.',
      objective: 'Descubra um Lobisomem sem ser detectada.',
      targeting:
        'Escolhe espiar ou se abster; o Lobisomem descoberto é sorteado pelo servidor.',
      rules: [
        'Ao espiar, descobre privadamente um Lobisomem vivo.',
        'Cada tentativa tem 25% de chance de revelar privadamente a Menina aos Lobisomens vivos.',
      ],
      mark: 'm',
    },
  },
  resolutionPriority: [
    'Consolidar escolhas e votos da alcateia.',
    'Aplicar cura da Bruxa e proteção do Médico.',
    'Interceptar com o Guardião somente se o ataque ainda estiver ativo.',
    'Aplicar ataques restantes e o veneno.',
    'Resolver em fila o disparo do Caçador, amantes e outras mortes derivadas.',
    'Avaliar vitórias somente depois que toda a cadeia terminar.',
  ],
  specialVictories: [
    'Os dois amantes como únicos sobreviventes vencem antes das condições principais.',
    'O Bobo expulso recebe vitória pessoal, mas a partida principal continua.',
    'Depois vêm Cidade sem Lobisomens e Lobisomens em paridade ou maioria.',
  ],
};

export const roleCatalog = gameRuleCatalog.roles;

export const specialRoleIds: RoleId[] = [
  'hunter',
  'seer',
  'witch',
  'doctor',
  'fool',
  'cupid',
  'guardian',
  'mayor',
  'little-girl',
];

export const phaseCopy: Record<
  GamePhase | 'lobby',
  { eyebrow: string; title: string; instruction: string }
> = {
  lobby: {
    eyebrow: 'Antes do sino',
    title: 'A vila se reúne',
    instruction: 'Prepare a partida e aguarde todas as pessoas.',
  },
  'first-night': {
    eyebrow: 'Primeira noite',
    title: 'A lua escolhe seus segredos',
    instruction: 'Veja sua carta e cumpra sua primeira tarefa em silêncio.',
  },
  night: {
    eyebrow: 'Noite',
    title: 'Portas fechadas, olhos atentos',
    instruction: 'Faça sua ação em segredo ou aguarde o amanhecer.',
  },
  dawn: {
    eyebrow: 'Alvorada',
    title: 'O sino rompe a névoa',
    instruction: 'Descubra o que a noite deixou para trás.',
  },
  discussion: {
    eyebrow: 'Dia',
    title: 'A praça toma a palavra',
    instruction: 'Conversem. A verdade raramente chega sozinha.',
  },
  voting: {
    eyebrow: 'Julgamento',
    title: 'Cada gesto pesa',
    instruction: 'Seu voto é secreto e pode ser substituído até o fim.',
  },
  'day-resolution': {
    eyebrow: 'Veredito',
    title: 'A vila fez sua escolha',
    instruction: 'O resultado do julgamento será anunciado.',
  },
  'hunter-shot': {
    eyebrow: 'Último ato',
    title: 'O Caçador ergue a arma',
    instruction: 'Uma decisão final ainda precisa ser tomada.',
  },
  finished: {
    eyebrow: 'Fim da crônica',
    title: 'A lua conhece os nomes',
    instruction: 'Os papéis são revelados e os vencedores celebrados.',
  },
};

export const actionLabels: Record<
  GameActionType,
  { title: string; submit: string }
> = {
  'wolf-vote': {
    title: 'Escolha da alcateia',
    submit: 'Confirmar voto da alcateia',
  },
  'seer-inspect': {
    title: 'Quem deseja inspecionar?',
    submit: 'Consultar alinhamento',
  },
  'witch-heal': { title: 'Poção de cura', submit: 'Usar poção de cura' },
  'witch-poison': { title: 'Poção de veneno', submit: 'Usar poção de veneno' },
  'doctor-protect': {
    title: 'Quem será protegido?',
    submit: 'Confirmar proteção',
  },
  'hunter-shoot': { title: 'Seu último disparo', submit: 'Confirmar alvo' },
  'cupid-link': { title: 'Escolha duas pessoas', submit: 'Unir amantes' },
  'guardian-protect': {
    title: 'Quem será guardado?',
    submit: 'Confirmar guarda',
  },
  'little-girl-spy': { title: 'Espiar a alcateia?', submit: 'Correr o risco' },
  'day-vote': { title: 'Quem deve deixar a vila?', submit: 'Confirmar voto' },
};

export function werewolfCount(playerCount: number): number {
  if (playerCount <= 8) return 1;
  if (playerCount <= 12) return 2;
  if (playerCount <= 16) return 3;
  return 4;
}
