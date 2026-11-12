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
      short:
        'À noite, reconheça seus aliados e vote em segredo para escolher a vítima da alcateia. Durante o dia, misture-se à vila e desvie as suspeitas.',
      objective:
        'Sobreviva com a alcateia até que os Lobisomens vivos sejam tantos quanto todos os demais sobreviventes juntos.',
      targeting:
        'Em cada noite, escolha uma pessoa viva que não pertença à alcateia. Você pode trocar seu voto enquanto a fase estiver aberta.',
      rules: [
        'Os Lobisomens vivos conhecem uns aos outros e votam em segredo.',
        'Somente uma maioria única produz ataque; empate ou ausência de votos não ataca ninguém.',
        'A alcateia vence quando seus sobreviventes igualam ou superam todos os demais, salvo uma vitória especial anterior.',
      ],
      mark: 'L',
    },
    villager: {
      name: 'Aldeão',
      short:
        'Você não possui poder noturno. Observe comportamentos, compare relatos, participe da discussão e use seu voto para proteger a vila.',
      objective:
        'Descubra e elimine todos os Lobisomens antes que a alcateia alcance a maioria.',
      targeting:
        'À noite, aguarde as ações dos outros papéis. Na votação diurna, escolha outra pessoa viva ou confirme uma abstenção.',
      rules: [
        'Aguarda o amanhecer sem ação própria durante a noite.',
        'A Cidade vence quando nenhum Lobisomem permanece vivo, salvo uma vitória especial anterior.',
      ],
      mark: 'A',
    },
    hunter: {
      name: 'Caçador',
      short:
        'Jogue como membro da Cidade enquanto estiver vivo. Se morrer, uma última decisão será aberta para você disparar contra outro sobrevivente.',
      objective:
        'Ajude a Cidade a eliminar os Lobisomens e, ao morrer, use seu disparo para atingir a maior ameaça restante.',
      targeting:
        'Somente após sua morte, escolha uma pessoa que ainda esteja viva. Confirme antes do prazo ou o disparo será perdido.',
      rules: [
        'Se o prazo acabar sem escolha, o disparo é perdido.',
        'A morte do alvo e todas as mortes decorrentes são resolvidas antes da verificação de vitória.',
      ],
      mark: 'C',
    },
    seer: {
      name: 'Vidente',
      short:
        'A cada noite, investigue discretamente uma pessoa e guarde o resultado para orientar a discussão sem se expor cedo demais.',
      objective:
        'Identifique o alinhamento dos jogadores e conduza a Cidade até todos os Lobisomens serem eliminados.',
      targeting:
        'Escolha outra pessoa viva. Você não pode investigar a si mesma e recebe apenas o alinhamento, não o papel exato.',
      rules: [
        'O resultado revela apenas o alinhamento atual: Lobisomens, Cidade ou Neutro.',
        'A descoberta permanece privada para a Vidente.',
      ],
      mark: 'V',
    },
    witch: {
      name: 'Bruxa',
      short:
        'Você possui uma poção de cura e uma de veneno para toda a partida. Observe a vítima da alcateia e decida se vale a pena interferir.',
      objective:
        'Use seus recursos limitados no momento certo para manter aliados vivos e eliminar uma ameaça à Cidade.',
      targeting:
        'A cura salva somente o alvo atual da alcateia. O veneno pode eliminar outra pessoa viva. Apenas uma poção pode ser usada por noite.',
      rules: [
        'Cada poção pode ser usada uma única vez na partida e somente uma das duas pode ser confirmada por noite.',
        'A cura cancela o ataque antes da possível interceptação do Guardião; o veneno é dano letal separado.',
      ],
      mark: 'B',
    },
    doctor: {
      name: 'Médico',
      short:
        'A cada noite, antecipe o alvo da alcateia e escolha alguém para proteger. Você pode proteger a si mesmo, mas precisa variar o paciente.',
      objective:
        'Impeça ataques decisivos da alcateia e ajude a Cidade a manter seus jogadores vivos.',
      targeting:
        'Escolha qualquer pessoa viva, inclusive você, mas nunca a mesma pessoa protegida na noite imediatamente anterior.',
      rules: [
        'A proteção impede somente o ataque da alcateia.',
        'Veneno e mortes derivadas atravessam a proteção; um ataque bloqueado não aciona o Guardião.',
      ],
      mark: 'M',
    },
    fool: {
      name: 'Bobo',
      short:
        'Você não possui ação noturna. Durante a discussão, tente parecer suspeito o suficiente para receber os votos da vila.',
      objective:
        'Conquiste sua vitória pessoal sendo expulso pela votação diurna.',
      targeting:
        'Vote normalmente enquanto estiver vivo. Seu poder depende de ser o alvo escolhido pela vila, não de selecionar alguém.',
      rules: [
        'Apenas a expulsão pelo voto concede sua vitória pessoal; outras causas de morte não concedem.',
        'Sua vitória é adicional e não encerra a disputa principal.',
      ],
      mark: 'B',
    },
    cupid: {
      name: 'Cupido',
      short:
        'Na primeira noite, forme um casal. Depois dessa escolha única, participe das discussões e votações como membro da Cidade.',
      objective:
        'Ajude a Cidade a vencer, levando em conta que os amantes compartilham o destino e podem conquistar uma vitória própria.',
      targeting:
        'Escolha exatamente duas pessoas vivas e diferentes na primeira noite. Você pode incluir a si mesmo no casal.',
      rules: [
        'Cada amante conhece somente a identidade do outro.',
        'Quando um amante morre, o outro morre em seguida; a cadeia inteira termina antes da vitória ser avaliada.',
        'Se forem os dois últimos sobreviventes, vencem juntos antes das condições da Cidade ou dos Lobisomens.',
      ],
      mark: 'C',
    },
    guardian: {
      name: 'Guardião',
      short:
        'A cada noite, escolha alguém para guardar. Se a alcateia atacar essa pessoa e o ataque não for bloqueado, você morre no lugar dela.',
      objective:
        'Proteja jogadores importantes e esteja disposto a se sacrificar para impedir uma morte decisiva.',
      targeting:
        'Escolha outra pessoa viva. Você nunca pode guardar a si mesmo e a proteção vale apenas para aquela noite.',
      rules: [
        'Só intercepta um ataque da alcateia que ainda exista após cura e proteção do Médico.',
        'Não intercepta veneno nem mortes derivadas e morre no lugar do alvo guardado.',
      ],
      mark: 'G',
    },
    mayor: {
      name: 'Prefeito',
      short:
        'Você não recebe uma ação especial ou um botão próprio. Discuta e vote normalmente; enquanto estiver vivo, seu voto confirmado vale dois.',
      objective:
        'Use o peso secreto do seu voto para conduzir as expulsões e ajudar a Cidade a eliminar todos os Lobisomens.',
      targeting:
        'Na votação diurna, escolha outra pessoa viva ou confirme uma abstenção. O servidor aplica automaticamente o peso dois ao seu voto em uma pessoa.',
      rules: [
        'Seu último voto confirmado vale dois; você pode alterá-lo enquanto a votação estiver aberta.',
        'O peso extra é aplicado sem anunciar aos demais quem é o Prefeito.',
        'Se você morrer, deixa de votar e não possui nenhuma ação adicional.',
      ],
      mark: 'P',
    },
    'little-girl': {
      name: 'Menina',
      short:
        'À noite, acione a espionagem para tentar descobrir um membro vivo da alcateia. A informação recebida é privada, mas existe risco em cada tentativa.',
      objective:
        'Descubra Lobisomens e use essas pistas durante o dia sem deixar claro para a alcateia que você é a Menina.',
      targeting:
        'Você não escolhe um alvo. Confirme a ação de espiar e o servidor sorteará um Lobisomem vivo para revelar a você.',
      rules: [
        'Ao espiar, você descobre privadamente um Lobisomem vivo aleatório.',
        'Cada espionagem tem 25% de chance de revelar sua identidade aos Lobisomens vivos.',
        'Ser detectada não elimina você imediatamente, mas permite que a alcateia saiba quem atacar nas próximas noites.',
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
  { title: string; submit: string; instruction?: string }
> = {
  'wolf-vote': {
    title: 'Quem os Lobisomens devem matar?',
    submit: 'Confirmar meu voto',
    instruction:
      'Cada Lobisomem vota em segredo. A alcateia atacará quem receber sozinho o maior número de votos; em caso de empate ou sem votos, ninguém será atacado.',
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
