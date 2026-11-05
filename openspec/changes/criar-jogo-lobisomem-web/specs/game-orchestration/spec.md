# Spec Delta

## Purpose

Define o ciclo autoritativo e automatizado da partida, incluindo fases, prazos, votos, eliminacoes, sincronizacao e condicoes de encerramento.

## ADDED Requirements

### Requirement: Inicio e estado autoritativo da partida
O sistema SHALL criar uma partida imutavelmente associada aos participantes e configuracoes validados no lobby. O servidor MUST ser a autoridade sobre fase, rodada, jogadores vivos, acoes aceitas, eliminacoes e vencedores.

#### Scenario: Inicio atomico
- **WHEN** o anfitriao inicia um lobby valido
- **THEN** o sistema fixa a composicao, distribui os papeis uma unica vez e conduz todos os clientes para a primeira fase

#### Scenario: Comando atrasado ou duplicado
- **WHEN** o servidor recebe novamente um comando ja processado ou pertencente a uma fase encerrada
- **THEN** o sistema nao aplica o efeito uma segunda vez e retorna o estado vigente ao cliente

### Requirement: Informacao publica e privada
O sistema MUST fornecer a cada participante apenas o estado publico e as informacoes privadas autorizadas para sua identidade e papel. O papel e as acoes secretas de um participante MUST NOT aparecer em eventos, respostas ou telas de outros jogadores, exceto quando uma regra determinar sua revelacao.

#### Scenario: Consulta individual do papel
- **WHEN** um participante autenticado abre sua carta durante a partida
- **THEN** o sistema mostra somente seu proprio papel, objetivo e acoes disponiveis

#### Scenario: Atualizacao publica
- **WHEN** fase, cronometro, estado de conexao ou lista de vivos muda
- **THEN** todos os clientes da sala recebem a versao publica atualizada sem dados secretos

### Requirement: Ciclo de fases automatizado
O sistema SHALL conduzir primeira noite, noite regular, anuncio da alvorada, discussao diurna, votacao e resolucao diurna, repetindo o ciclo ate uma condicao de vitoria. A primeira noite MUST incluir as acoes exclusivas de preparacao antes das demais acoes noturnas.

#### Scenario: Avanco por prazo
- **WHEN** o prazo da fase atual termina
- **THEN** o servidor fecha novos comandos para a fase, resolve as acoes aceitas e avanca uma unica vez para a proxima fase aplicavel

#### Scenario: Todos concluem antes do prazo
- **WHEN** todas as pessoas com uma decisao obrigatoria confirmam sua escolha antes do prazo
- **THEN** o sistema pode encerrar a fase antecipadamente sem revelar quem ainda estava decidindo aos demais

#### Scenario: Jogador nao responde
- **WHEN** um participante nao envia uma acao antes do fim da fase
- **THEN** o sistema registra abstencao para aquela acao e continua a partida

### Requirement: Cronometro de discussao
O sistema SHALL iniciar cada discussao diurna com a duracao configurada pela sala, usando cinco minutos como valor padrao. O tempo restante MUST derivar de um prazo do servidor e continuar correndo durante desconexoes ou suspensao do navegador.

#### Scenario: Sincronizacao de cronometro
- **WHEN** um cliente entra, retorna ao primeiro plano ou reconecta durante a discussao
- **THEN** o sistema calcula e apresenta o tempo restante a partir do prazo autoritativo

#### Scenario: Fim da discussao
- **WHEN** o prazo da discussao chega a zero
- **THEN** o sistema encerra a discussao e abre a votacao diurna

### Requirement: Votacao diurna
O sistema SHALL permitir um voto secreto por jogador vivo em outro jogador vivo e, quando configurado, na opcao "nao expulsar". Cada jogador pode substituir seu voto ate o encerramento; apenas seu ultimo voto aceito SHALL contar.

#### Scenario: Alvo com maior contagem unica
- **WHEN** a votacao termina e um jogador possui sozinho a maior contagem ponderada
- **THEN** o sistema expulsa esse jogador, salvo se "nao expulsar" tiver contagem igual ou maior

#### Scenario: Sem expulsao vence
- **WHEN** a opcao "nao expulsar" esta habilitada e recebe contagem igual ou maior que qualquer jogador
- **THEN** o sistema encerra o dia sem expulsao

#### Scenario: Empate entre jogadores
- **WHEN** dois ou mais jogadores empatam na maior contagem e "nao expulsar" nao prevalece
- **THEN** o sistema encerra o dia sem expulsao

#### Scenario: Voto de participante eliminado
- **WHEN** um participante eliminado tenta votar
- **THEN** o sistema rejeita o voto e nao altera a contagem

### Requirement: Resolucao ordenada de acoes e mortes
O sistema MUST resolver efeitos da rodada em uma ordem unica e reproduzivel: escolhas de alvo, bloqueios e protecoes, ataques e pocoes, mortes derivadas e, por fim, condicoes de vitoria. As mortes noturnas SHALL ser anunciadas na alvorada sem revelar a origem, salvo regra especifica do papel.

#### Scenario: Efeitos concorrentes sobre um alvo
- **WHEN** duas ou mais acoes afetam o mesmo jogador na rodada
- **THEN** o sistema aplica a prioridade publicada nas regras dos papeis e registra um unico resultado final coerente

#### Scenario: Cadeia de mortes
- **WHEN** uma morte ativa outro efeito de morte
- **THEN** o sistema resolve toda a cadeia antes de verificar a vitoria ou abrir a fase seguinte

### Requirement: Condicoes de vitoria principal
O sistema SHALL declarar vitoria da Cidade quando nenhum Lobisomem permanecer vivo. O sistema SHALL declarar vitoria dos Lobisomens quando a quantidade de lobisomens vivos for igual ou superior a quantidade total dos demais jogadores vivos. Condicoes especiais de papeis MUST ser avaliadas antes dessas condicoes quando explicitamente definido.

#### Scenario: Ultimo lobisomem eliminado
- **WHEN** a resolucao deixa zero lobisomens vivos e nenhuma condicao especial anterior encerra a partida
- **THEN** o sistema encerra a partida com vitoria da Cidade

#### Scenario: Lobisomens alcancam paridade
- **WHEN** a resolucao deixa os lobisomens vivos em numero igual ou maior aos demais vivos e nenhuma condicao especial anterior encerra a partida
- **THEN** o sistema encerra a partida com vitoria dos Lobisomens

### Requirement: Encerramento e revelacao
Ao encerrar a partida, o sistema SHALL impedir novas acoes, apresentar os vencedores principais e pessoais e revelar a distribuicao completa de papeis e os eventos decisivos da partida.

#### Scenario: Resultado final sincronizado
- **WHEN** qualquer condicao de encerramento e satisfeita
- **THEN** todos os participantes recebem o mesmo resultado final, respeitando vencedores pessoais adicionais
