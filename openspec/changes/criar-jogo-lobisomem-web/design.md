# Design

## Context

O repositorio possui apenas a estrutura OpenSpec, sem aplicacao, stack ou dados anteriores. A solucao precisa atender grupos de 6 a 20 pessoas em celulares sujeitos a suspensao de abas e redes instaveis, enquanto protege papeis e acoes secretas. Consulte `proposal.md` para a motivacao e `specs/` para os contratos de comportamento.

## Goals / Non-Goals

**Goals:**

- Manter regras, prazos e resultados sob uma unica autoridade no servidor.
- Separar com clareza o dominio testavel do transporte em tempo real e da interface.
- Permitir reconexao segura sem conta e sem bloquear o andamento da partida.
- Entregar um primeiro deploy simples, observavel e recuperavel sem impedir evolucao futura.

**Non-Goals:**

- Aplicativos nativos, distribuicao em lojas ou funcionamento de partidas offline.
- Contas, perfis permanentes, matchmaking publico, ranking ou historico entre partidas.
- Chat, audio, video, espectadores ou moderacao global.
- Escala horizontal e partidas distribuidas entre regioes no MVP.

## Decisions

### 1. Monolito modular TypeScript com cliente web separado por fronteira

O projeto sera um workspace TypeScript com tres fronteiras internas: cliente web mobile-first, servidor HTTP/tempo real e pacote de dominio puro compartilhado apenas por tipos publicos e validadores. O servidor e o processador de prazos serao implantados como um unico servico no MVP, usando um banco relacional transacional.

Essa estrutura reduz custo operacional e permite testar regras sem rede ou interface. Microservicos foram rejeitados porque introduziriam coordenacao distribuida antes de existir demanda. Logica peer-to-peer foi rejeitada porque permitiria adulteracao de estado e vazamento de papeis.

### 2. Comandos por HTTPS e atualizacoes por canal bidirecional

Criacao, entrada e comandos de jogo serao requisicoes autenticadas e idempotentes por HTTPS. Um canal bidirecional autenticado enviara snapshots iniciais e eventos de atualizacao; ao reconectar, o cliente pedira uma nova projecao em vez de presumir que recebeu todos os eventos.

Cada comando carregara um identificador unico, a versao de estado observada e a fase esperada. O servidor rejeitara comandos repetidos, obsoletos ou de uma fase encerrada. Isso evita efeitos duplicados quando uma rede mobile repete uma requisicao. Usar apenas atualizacoes periodicas foi rejeitado por aumentar atraso e carga; usar apenas o canal bidirecional foi rejeitado por dificultar idempotencia, respostas de erro e recuperacao.

### 3. Maquina de estados autoritativa e prazos persistidos

A partida sera modelada como uma maquina de estados explicita. Cada transicao valida comandos dentro de uma transacao, grava a nova versao, os efeitos de dominio e o proximo prazo absoluto. Um executor de prazos consulta fases vencidas e tenta avanca-las com controle de concorrencia; assim, reinicios do processo nao reiniciam cronometros nem aplicam uma transicao duas vezes.

O cliente deriva apenas a exibicao regressiva do prazo recebido. Ele nunca decide que uma fase acabou. No MVP, uma unica instancia ativa executara os prazos; a tabela de fases mantera a precondicao necessaria para introduzir lease distribuido se houver escala horizontal no futuro.

### 4. Projecoes separadas por destinatario

O estado de dominio completo permanece exclusivamente no servidor. A camada de projecao produz:

- uma visao publica da sala com fase, prazo, vivos, conectividade e anuncios;
- uma visao privada por participante com papel, recursos, conhecimentos e acoes permitidas;
- uma visao de anfitriao apenas com controles administrativos de lobby, nunca com papeis extras.

Eventos enviados ao canal serao construidos a partir dessas projecoes, e logs operacionais nao incluirao papeis, alvos privados, credenciais ou payloads completos. Transmitir o estado completo e ocultar campos apenas na interface foi rejeitado porque qualquer participante poderia inspecionar a rede.

### 5. Sessao anonima com credencial opaca

Ao criar ou entrar em uma sala, o servidor emitira uma credencial aleatoria de alta entropia vinculada ao participante e armazenara somente seu resumo seguro. No navegador, ela sera mantida em cookie `Secure`, `HttpOnly` e `SameSite`, com validacao de origem e protecao contra requisicoes forjadas. A credencial sera rotacionada na reconexao quando apropriado e invalidada na remocao do lobby ou no encerramento da retencao da sala.

Codigos de quatro letras identificam salas, mas nunca autenticam participantes. Criacao e tentativas de entrada serao limitadas por origem e janela de tempo para reduzir enumeracao e abuso. Contas foram rejeitadas para preservar o fluxo de entrada rapido definido no escopo.

### 6. Modelo persistente orientado a agregados da partida

O armazenamento relacional tera como agregados principais `Room`, `Participant` e `Game`. A partida mantera configuracao congelada, versao, fase, rodada, prazo e status. Tabelas associadas registrarao atribuicoes de papel, recursos consumiveis, vinculos, votos, acoes por fase, efeitos resolvidos, vencedores e chaves de idempotencia.

Restricoes de unicidade garantirao codigo entre salas ativas, apelido normalizado por sala, uma atribuicao por participante e um comando por identificador. Dados secretos serao lidos somente pelos casos de uso que constroem a projecao autorizada.

### 7. Papeis como politicas de dominio e pipeline de resolucao

O pacote de dominio representara cada papel por metadados, validacao de alvo, coleta de decisao e regras puras de resolucao. A configuracao seleciona papeis do catalogo, e Aldeoes completam a composicao depois do calculo fixo de Lobisomens.

A noite sera resolvida por um pipeline deterministico: consolidar escolhas da alcateia, aplicar cura e protecao do Medico, decidir a interceptacao do Guardiao, aplicar ataques e veneno, processar em fila as mortes derivadas de Cacador e amantes e avaliar vitorias. Resultados aleatorios, como embaralhamento e deteccao da Menina, serao produzidos por uma fonte segura e gravados como fatos para permitir auditoria e testes reproduziveis.

Uma cadeia extensa de condicionais no controlador foi rejeitada porque mistura transporte com regras e torna regressoes entre papeis dificeis de isolar. Um sistema de plugins carregados em tempo de execucao tambem foi rejeitado por adicionar complexidade e superficie de seguranca sem necessidade no catalogo inicial.

### 8. PWA com cache restrito ao shell

O cliente publicara manifest, icones, cores de tema, modo standalone e service worker. O cache contera apenas artefatos versionados da interface e a pagina offline; respostas autenticadas, snapshots, papeis e comandos nao serao armazenados pelo service worker. Atualizacoes do shell serao ativadas entre navegacoes seguras, sem recarregar silenciosamente uma decisao em andamento.

O cliente observara mudancas de visibilidade para recobrir informacoes secretas e, ao voltar ao primeiro plano, renovara a projecao e o prazo. Nao havera fila offline para comandos, pois uma acao atrasada poderia pertencer a outra fase.

### 9. Verificacao por camadas

Testes unitarios de dominio cobrirao cada papel, combinacoes de protecao, cadeias de morte, tabelas de composicao e condicoes de vitoria com relogio e aleatoriedade controlados. Testes de integracao exercitarao transacoes, autorizacao, idempotencia, vencimento de fases e filtragem de projecoes. Testes ponta a ponta com varios contextos de navegador cobrirao criacao, entrada, partida curta, reconexao, instalabilidade e larguras mobile.

Os cenarios das especificacoes serao a base da matriz de aceite. Uma verificacao automatizada adicional inspecionara payloads destinados a outro participante para impedir regressao de vazamento de segredos.

## Risks / Trade-offs

- [Codigo de quatro letras possui espaco limitado e pode ser enumerado] -> Usar apenas como localizador, limitar tentativas, expirar salas e exigir credencial separada para qualquer controle.
- [Celulares suspendem o JavaScript e o canal em segundo plano] -> Manter prazo e estado no servidor, renovar snapshot ao recuperar visibilidade e nunca depender de timer local para transicao.
- [Combinacoes de papeis geram efeitos ambiguos] -> Centralizar a ordem de resolucao, testar a matriz de interacoes e registrar cada fato aleatorio ou efeito aplicado.
- [Uma instancia de servidor limita disponibilidade e escala] -> Persistir prazos e versoes para recuperacao; monitorar uso antes de introduzir coordenacao e distribuicao.
- [Cookie anonimo perdido impede recuperar a mesma vaga] -> Explicar que a retomada depende do mesmo navegador; recuperacao manual ou transferencia de vaga fica fora do MVP para nao permitir sequestro de identidade.
- [Cache PWA pode servir uma interface incompativel] -> Versionar recursos, manter contratos tolerantes durante deploy e nunca cachear estado autenticado.

## Migration Plan

1. Criar workspace, banco e ambientes de desenvolvimento sem expor uma rota publica de jogo.
2. Implantar o servidor com migracoes de esquema, verificacao de saude e executor de prazos desabilitado.
3. Implantar o cliente web e validar acesso, cookies seguros e canal em tempo real em ambiente de teste HTTPS.
4. Habilitar partidas internas com telemetria de transicoes, falhas de comando e reconexoes, sem registrar segredos.
5. Publicar o manifest e service worker depois da validacao do fluxo online e testar instalacao em Android e iOS.
6. Liberar o acesso ao publico com limites de taxa e expiracao de salas ativos.

Como nao ha dados anteriores, rollback consiste em desabilitar novas salas, permitir que partidas ativas terminem quando seguro e reverter cliente e servidor para a versao compativel com o esquema. Migracoes de banco devem ser aditivas durante a primeira liberacao para manter essa reversao possivel.
