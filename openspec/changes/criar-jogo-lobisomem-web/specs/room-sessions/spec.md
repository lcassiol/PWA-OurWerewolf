# Spec Delta

## Purpose

Define como anfitrioes criam e configuram salas privadas e como participantes entram, aguardam e retomam suas sessoes sem criar uma conta.

## ADDED Requirements

### Requirement: Criacao de sala privada
O sistema SHALL permitir que uma pessoa crie uma sala e se torne seu anfitriao. O sistema MUST gerar para cada sala ativa um codigo unico de quatro letras ASCII maiusculas.

#### Scenario: Sala criada com sucesso
- **WHEN** uma pessoa informa um apelido valido e solicita uma nova sala
- **THEN** o sistema cria a sala, inclui a pessoa como anfitriao e apresenta o codigo de quatro letras para compartilhamento

#### Scenario: Colisao de codigo ativo
- **WHEN** o codigo gerado ja identifica outra sala ativa
- **THEN** o sistema gera outro codigo antes de concluir a criacao

### Requirement: Entrada por codigo e apelido
O sistema SHALL permitir entrada em uma sala que ainda esteja no lobby por meio do codigo e de um apelido, sem exigir cadastro. Apelidos MUST ser unicos na sala sem diferenciar maiusculas de minusculas.

#### Scenario: Participante entra no lobby
- **WHEN** uma pessoa informa o codigo de uma sala no lobby e um apelido disponivel
- **THEN** o sistema cria sua sessao de participante e atualiza a lista do lobby para todos

#### Scenario: Codigo inexistente ou encerrado
- **WHEN** uma pessoa informa um codigo que nao corresponde a uma sala ativa
- **THEN** o sistema recusa a entrada sem revelar dados de outras salas

#### Scenario: Apelido duplicado
- **WHEN** uma pessoa tenta usar um apelido ja ocupado na sala
- **THEN** o sistema solicita outro apelido e nao cria uma segunda vaga

#### Scenario: Partida ja iniciada
- **WHEN** uma nova pessoa tenta entrar em uma sala cuja partida ja comecou
- **THEN** o sistema recusa uma nova vaga e oferece apenas a retomada de uma sessao existente

### Requirement: Sessao anonima e reconexao
O sistema MUST emitir um segredo de sessao por participante e SHALL usa-lo para restaurar a mesma identidade, papel e estado apos perda de conexao. O segredo MUST permanecer restrito ao dispositivo e MUST NOT ser enviado a outros participantes.

#### Scenario: Retomada no mesmo dispositivo
- **WHEN** um participante desconectado retorna com um segredo valido para a sala
- **THEN** o sistema o associa a vaga existente sem criar outro jogador e envia o estado atual permitido para ele

#### Scenario: Tentativa de retomada invalida
- **WHEN** um cliente apresenta um segredo ausente, expirado ou pertencente a outra sala
- **THEN** o sistema nao revela o estado privado nem permite controlar a vaga

### Requirement: Configuracao controlada pelo anfitriao
O sistema SHALL permitir que apenas o anfitriao altere configuracoes enquanto a sala estiver no lobby. As configuracoes MUST incluir duracao da discussao diurna entre 1 e 15 minutos, permissao de voto em "nao expulsar" e selecao de papeis especiais disponiveis.

#### Scenario: Anfitriao altera configuracao valida
- **WHEN** o anfitriao salva configuracoes validas antes do inicio
- **THEN** o sistema persiste as configuracoes e publica o resumo nao secreto atualizado no lobby

#### Scenario: Participante tenta alterar configuracao
- **WHEN** um participante que nao e anfitriao envia uma alteracao
- **THEN** o sistema rejeita o comando e mantem as configuracoes atuais

#### Scenario: Alteracao apos o inicio
- **WHEN** qualquer pessoa tenta mudar a composicao ou as regras depois da distribuicao dos papeis
- **THEN** o sistema rejeita a alteracao para a partida em andamento

### Requirement: Lobby e prontidao
O sistema SHALL manter uma lista sincronizada de participantes e seu estado de prontidao. A partida MUST exigir entre 6 e 20 participantes, todos marcados como prontos, composicao valida e anfitriao conectado para iniciar.

#### Scenario: Sala pronta para iniciar
- **WHEN** a sala possui de 6 a 20 participantes, todos estao prontos e a composicao e valida
- **THEN** o sistema habilita o inicio somente para o anfitriao

#### Scenario: Condicao de inicio ausente
- **WHEN** o anfitriao tenta iniciar sem cumprir qualquer condicao do lobby
- **THEN** o sistema mantem a sala no lobby e informa as pendencias sem revelar dados privados

### Requirement: Saida e desconexao
O sistema SHALL diferenciar uma desconexao temporaria de uma saida voluntaria. Uma vaga no lobby pode ser removida por seu participante ou pelo anfitriao; depois do inicio, a vaga MUST permanecer na partida e ser marcada como desconectada ate a reconexao ou o encerramento.

#### Scenario: Remocao no lobby
- **WHEN** um participante sai voluntariamente no lobby ou o anfitriao o remove
- **THEN** o sistema libera a vaga e o apelido e invalida o segredo daquela sessao

#### Scenario: Desconexao durante a partida
- **WHEN** um participante perde conexao durante a partida
- **THEN** o sistema preserva sua vaga e continua os prazos e a partida
