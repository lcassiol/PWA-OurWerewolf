const translations: Record<string, string> = {
  'nickname must be a string': 'O apelido deve ser um texto.',
  'nickname must contain 1 to 24 characters':
    'O apelido deve ter entre 1 e 24 caracteres.',
  'nickname contains unsupported characters':
    'O apelido contém caracteres não permitidos.',
  'Room code generator returned an invalid code':
    'Não foi possível gerar um código válido para a sala.',
  'Could not allocate a room code':
    'Não foi possível criar um código para a sala.',
  'Room not found': 'Sala não encontrada.',
  'The game has already started': 'A partida já começou.',
  'The room is full': 'A sala está cheia.',
  'That nickname is already in use': 'Esse apelido já está em uso.',
  'Invalid room settings': 'As configurações da sala são inválidas.',
  'Only special roles can be selected':
    'Apenas papéis especiais podem ser selecionados.',
  'Settings are frozen after the game starts':
    'As configurações não podem ser alteradas após o início da partida.',
  'ready must be a boolean': 'O estado de prontidão é inválido.',
  'Readiness cannot change after the game starts':
    'A prontidão não pode mudar após o início da partida.',
  'Invalid avatar': 'Avatar inválido.',
  'Players cannot be removed after the game starts':
    'Jogadores não podem ser removidos após o início da partida.',
  'Participant not found': 'Participante não encontrado.',
  'The host cannot leave an active room':
    'O anfitrião não pode sair de uma sala ativa.',
  'A player cannot leave after the game starts':
    'Um jogador não pode sair após o início da partida.',
  'The game is still in progress': 'A partida ainda está em andamento.',
  'The room is not ready to start':
    'A sala ainda não está pronta para começar.',
  'The game has not started': 'A partida ainda não começou.',
  'A game requires between 6 and 20 players.':
    'Uma partida precisa ter entre 6 e 20 jogadores.',
  'Special roles can only appear once.':
    'Cada papel especial pode aparecer apenas uma vez.',
  'Remove at least one special role to leave room for a villager.':
    'Remova pelo menos um papel especial para deixar espaço para um aldeão.',
  'The game is finished': 'A partida terminou.',
  'The game version has changed': 'A partida foi atualizada. Tente novamente.',
  'That phase is no longer active': 'Essa fase não está mais ativa.',
  'That phase deadline has passed': 'O prazo dessa fase terminou.',
  'No phase is accepting commands': 'Nenhuma fase está aceitando ações.',
  'That afterlife round is not open': 'Essa rodada do além não está aberta.',
  'The discussion is no longer active': 'A discussão não está mais ativa.',
  'The discussion deadline has passed': 'O prazo da discussão terminou.',
  'The day summary is no longer active': 'O resumo do dia não está mais ativo.',
  'Eliminated players cannot act': 'Jogadores eliminados não podem agir.',
  'That action is not available to this role':
    'Essa ação não está disponível para este papel.',
  'That action is not available in this phase':
    'Essa ação não está disponível nesta fase.',
  'That night stage is not accepting this action':
    'Esta etapa da noite não está aceitando essa ação.',
  'The hunter is not choosing a shot': 'O caçador não está escolhendo um alvo.',
  'Targets must be unique': 'Os alvos devem ser diferentes.',
  'The hunter must shoot a living player':
    'O caçador deve escolher um jogador vivo.',
  'That potion has already been used': 'Essa poção já foi usada.',
  'The witch can use only one potion per night':
    'A bruxa pode usar apenas uma poção por noite.',
  'The healing potion can only save the current pack target':
    'A poção de cura só pode salvar o alvo atual dos lobisomens.',
  'Poison must target another living player':
    'O veneno deve ter como alvo outro jogador vivo.',
  'Eliminated players cannot vote.': 'Jogadores eliminados não podem votar.',
  'The no-exile option is disabled.':
    'A opção de não expulsar ninguém está desativada.',
  'A vote must target another living player.':
    'O voto deve ter como alvo outro jogador vivo.',
  'Only a living werewolf can vote.': 'Apenas um lobisomem vivo pode votar.',
  'The pack must target a living non-werewolf.':
    'A alcateia deve escolher um jogador vivo que não seja lobisomem.',
  'Only a living seer can inspect.': 'Apenas um vidente vivo pode investigar.',
  'The seer must inspect another living player.':
    'O vidente deve investigar outro jogador vivo.',
  'Only a living doctor can protect.': 'Apenas um médico vivo pode proteger.',
  'The doctor must protect a living player.':
    'O médico deve proteger um jogador vivo.',
  'The doctor cannot protect the same target on consecutive nights.':
    'O médico não pode proteger o mesmo alvo em noites consecutivas.',
  'Only a living guardian can guard.': 'Apenas um guardião vivo pode proteger.',
  'The guardian must guard another living player.':
    'O guardião deve proteger outro jogador vivo.',
  'Only a living cupid can link lovers.':
    'Apenas um cupido vivo pode unir os amantes.',
  'Cupid must choose two distinct living players.':
    'O cupido deve escolher dois jogadores vivos diferentes.',
  'Invalid afterlife round': 'Rodada do além inválida.',
  'Only eligible eliminated players can submit afterlife predictions':
    'Apenas jogadores eliminados elegíveis podem enviar palpites do além.',
  'Afterlife predictions must target living players':
    'Os palpites do além devem indicar jogadores vivos.',
  'Not enough afterlife points for that wager':
    'Você não tem pontos do além suficientes para essa aposta.',
  'Only eliminated players can use the afterlife chat':
    'Apenas jogadores eliminados podem usar o chat do além.',
  'The afterlife round is unavailable': 'A rodada do além não está disponível.',
  'Invalid exile target': 'Alvo de expulsão inválido.',
  'Invalid werewolf targets': 'Alvos dos lobisomens inválidos.',
  'Invalid winner prediction': 'Previsão de vencedor inválida.',
  'Invalid wager': 'Aposta inválida.',
  'Message text must be a string': 'A mensagem deve ser um texto.',
  'Message text must contain 1 to 500 characters':
    'A mensagem deve ter entre 1 e 500 caracteres.',
  'The game is unavailable': 'A partida não está disponível.',
  'Internal server error': 'Ocorreu um erro interno na vila.',
  'Route not found': 'Caminho não encontrado.',
  'Request body is too large': 'Os dados enviados são grandes demais.',
  'Request body must be valid JSON': 'Os dados enviados são inválidos.',
  'Request body contains unsupported data':
    'Os dados enviados contêm informações não permitidas.',
  'Too many attempts': 'Muitas tentativas. Aguarde um pouco e tente novamente.',
  'Only refresh messages are supported':
    'Esta mensagem em tempo real não é compatível.',
  'A valid room session is required': 'É necessária uma sessão válida da sala.',
  'Request origin is not allowed': 'A origem da solicitação não é permitida.',
};

const dynamicTranslations: Array<[RegExp, string]> = [
  [
    /^This action requires \d+ target\(s\) or an abstention$/,
    'Essa ação exige a quantidade correta de alvos ou uma abstenção.',
  ],
  [/^Unknown player: .+\.$/, 'Jogador não encontrado.'],
  [
    /^.+ is not a configurable special role\.$/,
    'O papel informado não pode ser configurado como papel especial.',
  ],
];

export function translateUserMessage(message: string): string {
  const translation = translations[message];
  if (translation) return translation;

  return (
    dynamicTranslations.find(([pattern]) => pattern.test(message))?.[1] ??
    message
  );
}
