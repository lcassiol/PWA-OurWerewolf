# Tasks

## 1. Fundacao do workspace e persistencia

- [x] 1.1 Criar o workspace TypeScript com pacotes de cliente, servidor e dominio, configurar formatacao, lint, testes e build, e verificar que todos os comandos passam em uma instalacao limpa
- [x] 1.2 Definir contratos compartilhados para identificadores, comandos, erros, snapshots e eventos publicos, e verificar por testes de tipo e serializacao que cliente e servidor usam os mesmos formatos
- [x] 1.3 Implementar o esquema relacional inicial para salas, participantes, partidas, fases, atribuicoes, acoes, efeitos, vencedores e idempotencia, e verificar migracao de ida/volta e restricoes de unicidade em banco de teste
- [x] 1.4 Configurar ambiente, saude, logs estruturados e redacao de campos secretos, e verificar que a inicializacao falha com configuracao invalida e que um teste de log nao encontra credenciais, papeis ou alvos privados

## 2. Dominio de composicao e papeis

- [x] 2.1 Implementar validacao para 6 a 20 jogadores, faixas automaticas de Lobisomens, papeis especiais unicos e preenchimento por Aldeoes, e verificar todas as fronteiras e composicoes invalidas com testes unitarios
- [x] 2.2 Implementar embaralhamento e atribuicao usando uma fonte de aleatoriedade injetavel, e verificar distribuicao completa, ausencia de duplicacao e reproducao deterministica nos testes
- [x] 2.3 Implementar politicas de Lobisomem, Aldeao, Vidente e Prefeito, e verificar alvos, empates da alcateia, alinhamentos revelados e peso secreto do voto com testes por papel
- [x] 2.4 Implementar recursos e resolucao de Bruxa, Medico e Guardiao, e verificar consumo unico, limite de uma pocao, alvo consecutivo e prioridade entre cura, protecao e interceptacao
- [x] 2.5 Implementar Cacador, Cupido e a fila de mortes derivadas, e verificar ultimo disparo, amantes, cascatas de morte e vitoria dos dois ultimos sobreviventes sem ciclos ou efeitos duplicados
- [x] 2.6 Implementar Bobo e Menina com resultados aleatorios registrados, e verificar vitoria pessoal, mortes sem premio, espionagem e os dois resultados da deteccao de 25%
- [x] 2.7 Implementar avaliacao ordenada de vitoria da Cidade, Lobisomens, amantes e vencedores pessoais, e verificar a matriz de zero lobos, paridade, condicao especial e continuidade apos a expulsao do Bobo
- [x] 2.8 Documentar no proprio produto o resumo e a interacao de cada papel conforme `specs/role-system/spec.md`, e verificar que o catalogo de ajuda cobre os onze papeis sem divergir das regras testadas

## 3. Salas, sessoes e lobby

- [x] 3.1 Implementar credenciais anonimas opacas com resumo persistido, cookie seguro, validacao de origem e invalidacao, e verificar criacao, retomada, segredo invalido e ausencia da credencial em respostas e logs
- [x] 3.2 Implementar criacao de sala com codigo unico de quatro letras e entrada por codigo e apelido normalizado, e verificar colisao de codigo, apelido duplicado, codigo inexistente e bloqueio de nova vaga apos o inicio
- [x] 3.3 Implementar limites de taxa para criacao e tentativa de entrada, e verificar que excesso recebe resposta controlada sem afetar sessoes autenticadas existentes
- [x] 3.4 Implementar configuracao exclusiva do anfitriao para duracao, voto sem expulsao e papeis especiais, e verificar limites, autorizacao e bloqueio de alteracao apos o inicio
- [x] 3.5 Implementar prontidao, lista de participantes, remocao no lobby e preservacao da vaga durante desconexao em partida, e verificar todas as precondicoes de inicio e as transicoes de conexao em testes de integracao
- [x] 3.6 Publicar os contratos HTTP de criacao, entrada, lobby e sessao em documentacao executavel, e verificar os exemplos contra o servidor de teste

## 4. Motor autoritativo da partida

- [x] 4.1 Implementar inicio atomico que congela configuracao, distribui papeis e cria a primeira fase, e verificar rollback integral diante de falha e rejeicao de inicio concorrente
- [x] 4.2 Implementar a maquina de estados para primeira noite, noite, alvorada, discussao, votacao, resolucao e encerramento, e verificar caminhos normais, abstencoes e avanco antecipado quando todas as decisoes obrigatorias terminam
- [x] 4.3 Implementar recepcao transacional de comandos com identificador, versao e fase esperada, e verificar idempotencia, conflito de versao, comando atrasado e autorizacao por jogador vivo e papel
- [x] 4.4 Integrar o pipeline noturno de votos, protecoes, pocoes, ataques, mortes derivadas e vitorias, e verificar a matriz de efeitos concorrentes definida nas especificacoes
- [x] 4.5 Implementar discussao e votacao diurna secreta com substituicao do voto, peso do Prefeito, opcao sem expulsao e empate sem eliminacao, e verificar cada resultado com testes de dominio e persistencia
- [x] 4.6 Implementar executor de prazos persistidos com controle de concorrencia e recuperacao apos reinicio, e verificar com relogio controlado que cada fase vencida avanca exatamente uma vez
- [x] 4.7 Implementar encerramento imutavel com vencedores, revelacao dos papeis e eventos decisivos, e verificar que comandos posteriores sao recusados e todos os resultados finais concordam

## 5. Projecoes e sincronizacao em tempo real

- [x] 5.1 Implementar construtores de projecao publica, privada, de anfitriao e final, e verificar por testes de vazamento que cada identidade recebe somente campos autorizados
- [x] 5.2 Implementar o canal bidirecional autenticado por sala com snapshot inicial e atualizacao apos comandos e transicoes, e verificar isolamento entre salas e entrega das versoes mais recentes
- [x] 5.3 Implementar presenca, desconexao e reconexao com renovacao completa da projecao, e verificar que uma aba suspensa retorna a fase e ao prazo atuais sem duplicar a vaga
- [x] 5.4 Implementar telemetria de conexoes, transicoes e falhas sem payloads privados, e verificar metricas e logs em um teste de partida sem encontrar dados secretos
- [x] 5.5 Documentar o protocolo de snapshots, versoes, reconexao e erros, e verificar que um cliente de teste consegue recuperar estado usando somente esse contrato

## 6. Interface mobile-first

- [x] 6.1 Criar navegacao e identidade visual responsiva para inicio, criacao e entrada, e verificar em testes de componente e viewports de 320 pixels que nao ha rolagem horizontal e que a acao principal permanece acessivel
- [x] 6.2 Criar lobby sincronizado com codigo compartilhavel, lista, prontidao e controles condicionais do anfitriao, e verificar fluxos de anfitriao e participante com testes de interface
- [x] 6.3 Criar configurador de duracao, voto sem expulsao e catalogo de papeis com validacao de composicao, e verificar mensagens para limites, excesso de especiais e quantidade automatica de lobos
- [x] 6.4 Criar carta secreta coberta por padrao, resumo do objetivo e seletor de acoes por papel, e verificar que perda de visibilidade recobre o conteudo e que alvos invalidos nao podem ser confirmados
- [x] 6.5 Criar telas de fase, cronometro derivado do prazo do servidor, alvorada, discussao, votacao e espera, e verificar mudancas de fase, voto substituido, abstencao e retorno do segundo plano
- [x] 6.6 Criar telas de eliminacao e resultado final com vencedores pessoais e revelacao completa, e verificar partidas encerradas pela Cidade, Lobisomens, amantes e Bobo adicional
- [x] 6.7 Implementar indicadores conectado, reconectando e offline com bloqueio de comandos nao confirmaveis, e verificar perda e retorno de rede durante uma acao
- [x] 6.8 Adicionar rotulos acessiveis, foco visivel, anuncios de fase e alvos de toque de 44 por 44 pixels, e verificar os fluxos principais com teclado e auditoria automatizada de acessibilidade

## 7. PWA e entrega operacional

- [ ] 7.1 Adicionar manifest, icones, cores, modo standalone e metadados de instalacao, e verificar os criterios de instalabilidade em ambiente HTTPS para layouts Android e iOS
- [x] 7.2 Implementar service worker com cache somente do shell versionado e pagina offline, e verificar que snapshots, respostas autenticadas, papeis e comandos nunca entram no cache
- [x] 7.3 Implementar orientacao de instalacao por plataforma e atualizacao segura do shell, e verificar prompt quando suportado, instrucoes manuais quando necessario e ausencia de recarga durante uma decisao
- [x] 7.4 Criar configuracao de deploy para cliente, servidor, banco e executor de prazos com migracoes aditivas, e verificar uma implantacao de teste, health check e reinicio durante uma fase ativa
- [x] 7.5 Documentar operacao, variaveis, migracao, rollback, limites de taxa e investigacao sem segredos, e verificar o runbook em uma implantacao limpa de teste

## 8. Aceite integrado

- [x] 8.1 Automatizar um fluxo ponta a ponta com seis clientes desde criacao e entrada ate encerramento, incluindo ao menos uma acao noturna, votacao e revelacao, e verificar o resultado nos seis contextos
- [x] 8.2 Automatizar cenarios de reconexao, aba suspensa, comando duplicado e reinicio do servidor, e verificar continuidade, prazo autoritativo e ausencia de efeitos repetidos
- [x] 8.3 Executar a matriz completa de cenarios das quatro especificacoes e registrar a correspondencia entre requisito e teste, verificando que nenhum requisito fica sem cobertura de aceite
- [x] 8.4 Validar seguranca de sessao, isolamento entre salas, filtragem de segredos, limites de taxa e cache PWA, e verificar que a suite de seguranca nao encontra exposicao de credenciais ou estado privado
- [ ] 8.5 Validar os fluxos em navegadores mobile Android e iOS, instalado e em aba, e verificar criacao, entrada, reconexao, carta secreta e votacao em retrato e paisagem
