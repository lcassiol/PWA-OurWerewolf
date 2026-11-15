# Tasks

## 1. Contratos e persistencia

- [x] 1.1 Definir em `@our-werewolf/shared` os comandos, mensagens, entrada por rodada, lancamentos, classificacao e uniao discriminada de `private.afterlife`, e verificar serializacao e typecheck com `npm run typecheck`.
- [x] 1.2 Criar a migracao aditiva para `afterlife_rounds`, `afterlife_entries`, `afterlife_messages` e `afterlife_ledger`, incluindo chaves estrangeiras, unicidade de eventos, indices e `down`, e verificar subida, repeticao, rollback e integridade em `apps/server/src/db/migrate.test.ts` com `npm test -w @our-werewolf/server`.

## 2. Ciclo autoritativo e pontuacao

- [x] 2.1 Implementar elegibilidade e lancamento unico dos 10 pontos quando uma eliminacao autoritativa libera o Alem, distinguindo `assignments.alive` de remocao administrativa, e verificar mortes por voto/noite, removidos e repeticao em testes do `GameService`.
- [x] 2.2 Abrir a atividade ao entrar em `dawn`, fixar os mortos elegiveis, fecha-la ao encerrar `voting` e impedir entradas retroativas, e verificar janelas, substituicao e comandos fora de rodada em testes de integracao do servidor.
- [x] 2.3 Validar e persistir a ultima entrada por participante/rodada, incluindo alvo vivo, suspeitos unicos, equipe, aposta de 1 a 3 e reserva de saldo, e verificar troca atomica, alvo invalidado e saldo insuficiente em testes de integracao.
- [x] 2.4 Resolver o palpite de expulsao com `+3` ou zero e registrar resultado sem duplicidade, inclusive dia sem expulsao e reinicio apos fechamento, e verificar os lancamentos resultantes em testes de integracao.
- [x] 2.5 Liquidar no fim da partida marcacoes `+1/-1` e apostas ganhas/perdidas, limitar saldo apresentado a zero, ordenar o ranking e compartilhar o titulo em empate, e verificar Cidade, Lobisomens, Amantes, empate, saldo negativo e repeticao de `finishGame` em testes de integracao.

## 3. API, chat e privacidade

- [x] 3.1 Implementar `private.afterlife` na projecao com mensagem exata apenas para expulsao pela vila, historico ordenado, estado proprio da rodada e resultado final condicional, e verificar que snapshots de vivos nunca contem dados do Alem em testes de privacidade.
- [x] 3.2 Implementar envio idempotente de mensagens normalizadas de 1 a 500 caracteres para mortos durante partida ativa, rejeitando vivos, removidos e escrita apos o fim, e verificar persistencia, ordem, duplicidade e reconexao em testes do servidor.
- [x] 3.3 Expor as rotas autenticadas de mensagem e entrada da rodada com `stale_command`/`phase_closed`, snapshot de recuperacao, incremento de versao e broadcast da sala, e verificar respostas HTTP, reenvio idempotente e atualizacao entre dois mortos em testes de servidor.
- [x] 3.4 Atualizar `docs/api.md` e `docs/protocol.md` com contratos, autorizacao e limites do Alem, e conferir que os exemplos correspondem aos tipos e rotas exercitados pelos testes.

## 4. Experiencia web dos mortos

- [x] 4.1 Adicionar metodos ao cliente HTTP e handlers em `App` para mensagem e entrada por rodada, reutilizando recuperacao de comandos obsoletos e bloqueio offline, e verificar sucesso, erro e snapshot mais recente em testes de API e hooks.
- [x] 4.2 Criar a area mobile-first do Alem em `GameScreen` com banner da expulsao, chat em texto simples, estados vazio/espera/fechado e controles de previsao, suspeitos e aposta, e verificar edicao ate o fechamento, confirmacao do servidor, limites e acessibilidade com Testing Library.
- [x] 4.3 Integrar a classificacao, extrato pessoal e destaque compartilhado de Oraculo na tela final somente para eliminados, e verificar empate, ausencia de mortos e invisibilidade para vivos em testes de privacidade da UI.
- [x] 4.4 Estilizar a experiencia nos temas existentes para desktop e mobile, preservando foco, contraste, rotulos e regioes anunciaveis, e verificar snapshots visuais existentes e `apps/web/src/PwaAccessibility.test.tsx` com `npm test -w @our-werewolf/web`.
- [x] 4.5 Cobrir em Playwright o fluxo com dois eliminados conversando e apostando, um vivo sem acesso e o ranking privado ao final, e verificar o cenario com `npm run test:e2e`.

## 5. Verificacao integrada

- [x] 5.1 Executar `npm run verify` e confirmar que formatacao, lint, tipos, testes e builds passam sem regressao nas regras ou no encerramento da partida principal.
- [x] 5.2 Executar `openspec validate adicionar-oraculo-do-alem --strict` e confirmar que todos os requisitos e cenarios do delta permanecem validos antes da revisao.
