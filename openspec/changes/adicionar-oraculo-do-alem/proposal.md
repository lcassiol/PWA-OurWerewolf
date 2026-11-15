# Proposal

## Why

Jogadores eliminados deixam de tomar decisoes e hoje apenas acompanham a partida, o que reduz o envolvimento ate o desfecho. Um espaco privado com conversa, previsoes e pontuacao ficticia mantem esses participantes entretidos sem interferir nas decisoes dos jogadores vivos nem revelar informacoes secretas.

## What Changes

- Exibir ao participante expulso pela votacao da vila a mensagem: “A vila encerrou sua jornada, mas seu espírito continua observando. Faça suas previsões e dispute o título de Oráculo do Além.”
- Liberar para todos os participantes eliminados em jogo um chat privado dos mortos, invisivel para jogadores vivos e participantes removidos administrativamente.
- Abrir uma atividade por rodada para os mortos preverem o proximo eliminado, marcarem suspeitos de serem Lobisomens e apostarem pontos ficticios na equipe vencedora.
- Permitir substituir escolhas enquanto a janela da rodada estiver aberta e fazer o servidor fechar, resolver e pontuar cada atividade de forma autoritativa.
- Manter palpites, acertos, saldo e classificacao privados dos mortos durante a partida; ao final, apresentar a classificacao e conceder o titulo compartilhavel de Oraculo do Alem a quem obtiver a maior pontuacao.
- Persistir mensagens, escolhas e resultados para preservar o entretenimento apos reconexao e impedir duplicidade em repeticoes de comandos.

## Capabilities

### New Capabilities
- `afterlife-engagement`: acesso ao espaco dos mortos, mensagem de entrada, chat privado, previsoes por rodada, apostas ficticias, pontuacao e titulo de Oraculo do Alem.

### Modified Capabilities

Nenhuma. O projeto ainda nao possui capacidades arquivadas em `openspec/specs`; a integracao com o comportamento de partida existente sera descrita pela nova capacidade sem alterar os deltas da mudanca-base em andamento.

## Impact

- Novos contratos compartilhados para comandos e projecoes privadas do pos-eliminacao.
- Novas tabelas SQLite para mensagens, participacoes por rodada e lancamentos de pontos, com migracao correspondente.
- Extensao do servico autoritativo, rotas HTTP e broadcasts WebSocket para chat, escolhas, fechamento de rodada e classificacao.
- Nova experiencia mobile-first na tela de jogo e apresentacao do resultado no encerramento.
- Testes de dominio, integracao do servidor, privacidade, reconexao, acessibilidade e fluxo ponta a ponta.
