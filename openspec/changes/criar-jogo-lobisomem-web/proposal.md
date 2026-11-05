# Proposal

## Why

Grupos que jogam Lobisomem presencialmente precisam distribuir papeis secretos, controlar rodadas e resolver votos sem exigir que cada participante instale um aplicativo nativo. Uma experiencia web mobile-first e instalavel reduz essa friccao e permite que o sistema conduza a partida de forma consistente.

## What Changes

- Criar salas privadas administradas por um anfitriao, identificadas por codigo aleatorio de quatro letras.
- Permitir entrada por apelido, sem conta, com retomada da mesma vaga apos uma desconexao.
- Oferecer configuracoes de composicao, duracao das fases e possibilidade de encerrar a votacao sem expulsao.
- Automatizar lobby, distribuicao secreta de papeis, fases diurnas e noturnas, acoes dos papeis, votacao, eliminacoes e condicoes de vitoria.
- Introduzir um catalogo inicial com Lobisomem, Aldeao, Cacador, Vidente, Bruxa, Medico, Bobo, Cupido, Guardiao, Prefeito e Menina, com validacao de composicao e quantidade de lobisomens proporcional ao grupo.
- Sincronizar estado e cronometros em tempo real entre celulares, preservando informacoes privadas por jogador.
- Disponibilizar uma interface responsiva e instalavel como PWA, sem exigir APK, mantendo claro que a partida ativa requer conexao com o servidor.

## Capabilities

### New Capabilities

- `room-sessions`: Criacao, configuracao, entrada por codigo, lobby, autoridade do anfitriao e reconexao de participantes.
- `game-orchestration`: Ciclo automatizado da partida, fases, cronometros, votos, eliminacoes, sincronizacao e determinacao de vitoria.
- `role-system`: Composicao, distribuicao confidencial e resolucao das habilidades e objetivos dos papeis jogaveis.
- `mobile-pwa`: Experiencia mobile-first acessivel pelo navegador e instalavel na tela inicial como Progressive Web App.

### Modified Capabilities

Nenhuma.

## Impact

- Introduz uma aplicacao web, um backend autoritativo em tempo real e armazenamento para salas e partidas em andamento.
- Exige um canal bidirecional para atualizacoes de estado, uma API para comandos autenticados por sessao e manifest/service worker para instalacao PWA.
- Exige testes de regras do dominio, isolamento de informacoes secretas, concorrencia de votos e acoes, reconexao e fluxos responsivos em celulares.
- Nao ha compatibilidade anterior a preservar, pois o repositorio ainda nao possui implementacao nem especificacoes de produto.
