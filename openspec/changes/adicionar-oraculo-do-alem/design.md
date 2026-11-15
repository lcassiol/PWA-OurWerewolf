# Design

## Context

Veja `proposal.md` para a motivacao e `specs/afterlife-engagement/spec.md` para o contrato de comportamento.

O servidor Node.js e a autoridade de fase, rodada e eliminacoes. `GameService` executa mutacoes em transacoes SQLite, registra efeitos de eliminacao, incrementa uma versao monotona e constroi um `GameSnapshot` separado para cada identidade. Comandos usam HTTP e idempotencia; WebSocket transmite snapshots completos apos `roomChanged`. O cliente React substitui o snapshot atual pela versao mais recente e hoje mostra aos eliminados apenas estados de espera.

A elegibilidade deve derivar de `assignments.alive`, nao de `participants.removed_at`: remocao invalida a sessao, enquanto eliminacao preserva a identidade para acompanhar a partida. O projeto usa um unico executor autoritativo de prazos, portanto abertura, fechamento e liquidacao das atividades podem permanecer no fluxo transacional existente sem coordenacao distribuida.

## Goals / Non-Goals

**Goals:**
- Isolar dados do Alem na projecao privada de identidades eliminadas.
- Tornar abertura, fechamento, substituicao de escolhas e pontuacao atomicos e recuperaveis.
- Reusar autenticacao, idempotencia, versao monotona, broadcasts e tratamento de comandos obsoletos existentes.
- Fornecer uma experiencia mobile-first acessivel sem esconder os anuncios e o estado publico da partida.

**Non-Goals:**
- Criar moderacao, denuncia, edicao ou exclusao de mensagens.
- Permitir que vivos, espectadores externos ou removidos leiam o chat ou a classificacao.
- Usar dinheiro, premios reais, probabilidades variaveis ou configuracao de pontuacao pelo anfitriao.
- Alterar regras de papeis, eliminacao, vitoria principal ou fases da partida.
- Suportar mais de uma instancia do executor autoritativo nesta mudanca.

## Decisions

### 1. Projecao privada dedicada ao Alem

Adicionar `private.afterlife`, nulo para participantes vivos e preenchido para eliminados. Durante a partida ele contem mensagem de entrada quando aplicavel, historico do chat, atividade corrente do proprio jogador, saldo disponivel e estado da janela. Somente no estado final inclui lancamentos proprios, classificacao dos mortos e titulares.

Essa forma estende o limite de seguranca ja existente em vez de criar um snapshot paralelo. A funcao de projecao consultara dados do Alem somente depois de confirmar `assignment.alive === 0`, reduzindo a chance de serializar dados e filtra-los tarde demais. Contratos compartilhados usarao uma uniao discriminada para estados `open`, `waiting`, `closed` e `finished`, evitando que a UI infira permissao de fase ou papel.

Alternativa considerada: endpoints de leitura separados. Eles reduziriam o tamanho do snapshot normal, mas duplicariam recuperacao, sincronizacao e controles de privacidade. As escritas permanecerao separadas; a leitura seguira no snapshot autoritativo.

### 2. Comandos HTTP especificos e idempotentes

Adicionar dois recursos autenticados sob a sala:
- `POST /rooms/:code/afterlife/messages` para mensagem com `commandId`, `expectedVersion` e texto.
- `PUT /rooms/:code/afterlife/rounds/:round/entry` para substituir atomicamente palpite, suspeitos, equipe e valor da aposta, tambem com `commandId` e `expectedVersion`.

Os metodos do servico validam identidade eliminada, partida ativa, versao, rodada, janela, alvos vivos na abertura e saldo disponivel antes de escrever. A tabela existente `idempotency` registra a resposta de ambos os comandos; repeticoes devolvem o snapshot atual sem nova mensagem, reserva ou lancamento. Erros `stale_command` e `phase_closed` preservam a recuperacao atual do cliente.

Alternativa considerada: ampliar `GameCommand`. Isso misturaria acoes de papel, vinculadas a uma fase aberta, com chat e uma janela que cruza alvorada, discussao e votacao. Recursos distintos deixam autorizacao e ciclo de vida explicitos.

### 3. Modelo persistente normalizado e razao imutavel

Uma nova migracao adicionara:
- `afterlife_rounds`: uma linha por jogo/rodada com abertura, fechamento, resultado da expulsao e marcadores de liquidacao.
- `afterlife_entries`: uma linha por rodada/participante elegivel, contendo ultima previsao, suspeitos em JSON validado, equipe, aposta reservada e instante de atualizacao.
- `afterlife_messages`: mensagens ordenadas por instante e identificador, vinculadas ao jogo e autor.
- `afterlife_ledger`: lancamentos imutaveis de saldo inicial, acerto de expulsao, marcacoes e liquidacao de aposta, com chave de evento unica.

Na primeira elegibilidade, um lancamento unico de `+10` cria o saldo inicial. Saldo disponivel e calculado pela soma do razao menos apostas ainda reservadas. Substituir uma entrada troca a reserva na mesma transacao; nao cria lancamento. No fim, as reservas sao convertidas em lancamentos de premio ou perda, as marcacoes sao apuradas e a pontuacao apresentada usa `max(0, soma)`. A classificacao pode ser calculada do razao final e nao precisa de uma copia mutavel.

Alternativa considerada: armazenar apenas um total na atribuicao. Embora menor, isso dificulta explicar resultados, detectar duplicidade e recuperar uma liquidacao interrompida. Chaves unicas por evento tornam cada etapa repetivel com seguranca.

### 4. Abertura e liquidacao acopladas a transicoes autoritativas

Ao entrar em `dawn`, depois de resolver as mortes noturnas, o servidor cria `afterlife_rounds` e entradas vazias para todas as atribuicoes mortas naquele momento. Isso fixa a elegibilidade sem depender de horario do cliente. Ao encerrar `voting`, fecha a rodada antes da resolucao diurna; `resolveDay` registra o expulso e credita `+3` aos palpites correspondentes. Dia sem expulsao apenas marca a categoria como resolvida.

Quem morre na resolucao diurna recebe chat e saldo inicial imediatamente, mas nao ganha uma entrada retroativa. Se houver proxima alvorada, entra na lista elegivel entao. Ao terminar o jogo, `finishGame` liquida marcacoes e apostas ainda abertas antes de publicar o snapshot final. Cada operacao usa insercoes protegidas por chaves unicas e ocorre na mesma transacao da mudanca de fase ou vitoria.

Alternativa considerada: um cronometro proprio para o Alem. Como os limites coincidem com transicoes existentes, outro agendador criaria corridas e recuperacao adicional sem beneficio observavel.

### 5. Broadcast por snapshot e versao global

Cada escrita aceita incrementa `games.version`/`rooms.version` e chama `roomChanged`, como os comandos atuais. Todos os sockets recebem um snapshot novo, mas somente mortos recebem `private.afterlife`; os vivos observam no maximo o avanco da versao. Isso permite que uma mensagem alcance todos os mortos e que reconexao continue sendo uma leitura completa.

Alternativa considerada: canal WebSocket separado e versao privada. Ele reduziria broadcasts e ocultaria o momento de atividade dos mortos, mas exigiria ordenacao entre duas versoes e mudaria a estrategia de substituicao de snapshots. Para salas limitadas a 20 participantes, o modelo atual e mais simples; nenhum conteudo ou resultado secreto e exposto aos vivos.

### 6. Experiencia do eliminado dentro da tela de jogo

`GameScreen` detectara `private.afterlife` e apresentara uma area "Alem" com chat e atividade da rodada, mantendo cabecalho, fase, anuncios e lista da vila. A mensagem exata de expulsao sera um banner com regiao anunciavel e nao um alerta bloqueante. A atividade usa controles nativos: radio para proximo expulso/equipe, checkboxes para suspeitos e seletor de 1 a 3 pontos. Escolhas locais so aparecem confirmadas apos resposta do servidor e ficam desabilitadas offline ou com dados privados desatualizados.

No encerramento, apenas o final de um jogador eliminado recebe o bloco de classificacao e seu extrato. Empates compartilham o destaque de Oraculo. Mensagens sao tratadas como texto simples e renderizadas pelo escape padrao do React.

Alternativa considerada: uma rota ou modal separado. Manter a area na tela reduz perda de contexto, evita navegacao concorrente com snapshots e funciona melhor em telas pequenas.

## Risks / Trade-offs

- [Mensagens aumentam o snapshot e o custo de broadcast] -> Limitar texto a 500 caracteres, selecionar em ordem indexada e inicialmente carregar o historico completo adequado ao limite de 20 jogadores; medir antes de introduzir paginacao.
- [Versao global revela que ocorreu alguma atividade privada] -> Aceitar o vazamento de timing, que nao revela conteudo nem acerto; documentar e testar que todos os campos do Alem permanecem ausentes para vivos.
- [Marcacoes repetidas podem favorecer quem morreu cedo] -> Manter a regra por rodada solicitada; penalidade simetrica reduz selecao indiscriminada e o comportamento fica explicito na interface.
- [Saldo calculado pode divergir se a liquidacao for repetida] -> Usar transacao e chaves unicas de evento no razao, com testes de reinicio e repeticao.
- [Um alvo morre entre abertura e fechamento] -> Invalidar a entrada para envio/substituicao e refletir que uma nova escolha e necessaria; nunca reatribuir automaticamente.
- [Historico do chat pode conter revelacoes de papeis] -> Confiar no limite de elegibilidade: somente mortos podem ler, e vivos nunca recebem o campo nem endpoint de leitura.

## Migration Plan

1. Aplicar a migracao aditiva antes de disponibilizar rotas e contratos; tabelas novas nao alteram partidas antigas nem exigem backfill.
2. Implantar servidor e cliente da mesma versao, pois a extensao opcional do snapshot e compativel com o estado anterior, mas os novos comandos dependem das rotas.
3. Verificar migracao para cima/baixo, chaves estrangeiras e inicializacao com partidas existentes nos testes de migracao.
4. Em rollback, remover primeiro cliente/rotas que escrevem e depois executar a migracao reversa. Dados do Alem podem ser descartados porque nao afetam o resultado da partida principal.
