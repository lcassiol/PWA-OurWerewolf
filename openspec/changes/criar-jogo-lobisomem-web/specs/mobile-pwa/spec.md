# Spec Delta

## Purpose

Define uma experiencia de jogo prioritaria para celulares, acessivel por URL e instalavel na tela inicial sem distribuicao de aplicativo nativo.

## ADDED Requirements

### Requirement: Acesso pelo navegador mobile
O sistema SHALL permitir criar, entrar e participar de uma partida por navegadores modernos em celulares sem baixar um APK ou aplicativo de loja. Os fluxos principais MUST funcionar em larguras a partir de 320 pixels sem rolagem horizontal.

#### Scenario: Entrada por celular
- **WHEN** uma pessoa abre a URL em um navegador mobile compativel
- **THEN** ela consegue criar uma sala ou informar codigo e apelido usando controles legiveis e tocaveis

#### Scenario: Orientacao ou largura muda
- **WHEN** o dispositivo alterna entre retrato e paisagem ou muda a area visivel
- **THEN** a interface reorganiza o conteudo sem ocultar a acao principal da fase

### Requirement: Instalacao como PWA
O sistema SHALL fornecer metadados, icones e comportamento de Progressive Web App para instalacao na tela inicial em plataformas compativeis. Quando o navegador nao oferecer um prompt automatico, o sistema SHALL disponibilizar instrucoes adequadas a plataforma.

#### Scenario: Instalacao suportada
- **WHEN** o navegador considera a aplicacao instalavel
- **THEN** a pessoa pode adicionar o jogo a tela inicial e abri-lo em uma janela independente

#### Scenario: Prompt automatico indisponivel
- **WHEN** a plataforma exige instalacao pelo menu do navegador
- **THEN** o sistema apresenta instrucoes nao bloqueantes para adicionar a pagina a tela inicial

### Requirement: Limites do modo offline
O PWA SHALL armazenar apenas os recursos necessarios para abrir sua estrutura e explicar o estado de conexao. Criar, entrar, consultar segredos ou enviar acoes de uma partida MUST exigir conexao com o servidor; comandos de jogo MUST NOT ser enfileirados para envio tardio.

#### Scenario: Aplicacao aberta sem rede
- **WHEN** a pessoa abre o PWA sem conexao
- **THEN** o sistema mostra uma tela offline e nao apresenta estado antigo como se a partida estivesse ativa

#### Scenario: Conexao perdida durante uma decisao
- **WHEN** a rede cai antes de o servidor confirmar uma acao
- **THEN** o cliente informa que a acao nao foi confirmada, bloqueia envio offline e tenta restaurar a sessao ao reconectar

### Requirement: Protecao visual de informacao secreta
O papel e os resultados privados SHALL permanecer ocultos por padrao em uma tela compartilhavel, exigindo uma acao deliberada para revelar e oferecendo uma acao imediata para ocultar novamente.

#### Scenario: Abertura da carta secreta
- **WHEN** o participante acessa a area do proprio papel
- **THEN** o sistema mostra uma capa antes de revelar o conteudo por uma acao deliberada

#### Scenario: Aplicacao perde foco
- **WHEN** a aplicacao vai para segundo plano ou sua janela perde visibilidade
- **THEN** o sistema volta a ocultar qualquer informacao secreta revelada

### Requirement: Estado de conexao e acessibilidade essencial
O cliente SHALL indicar de forma perceptivel os estados conectado, reconectando e offline. Acoes criticas MUST possuir rotulos textuais, foco visivel e alvos de toque de pelo menos 44 por 44 pixels, e o estado nao MUST depender apenas de cor.

#### Scenario: Reconexao em andamento
- **WHEN** o canal em tempo real e interrompido
- **THEN** a interface anuncia a reconexao, impede comandos sem confirmacao e preserva a navegacao segura

#### Scenario: Uso por teclado ou tecnologia assistiva
- **WHEN** uma pessoa navega por foco e ativa controles sem gesto de toque
- **THEN** ela consegue executar os mesmos fluxos principais e identificar fase, prazo e resultado das acoes
