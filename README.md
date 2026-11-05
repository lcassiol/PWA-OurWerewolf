# Vila da Lua / Our Werewolf

Jogo de Lobisomem para navegador, pensado para celulares e instalavel como PWA. Um anfitriao cria uma sala, compartilha um codigo de quatro letras e o servidor conduz papeis secretos, fases, cronometros, acoes e votacoes em tempo real.

## Arquitetura

- `apps/web`: cliente React 19 e Vite, responsivo e instalavel como PWA.
- `apps/server`: servidor Node.js 24 com HTTP, WebSocket e `node:sqlite`.
- `packages/domain`: regras puras dos papeis, votacoes, mortes e vitorias.
- `packages/shared`: contratos compartilhados entre cliente e servidor.
- `deploy`: imagens Docker e proxy Nginx.
- `docs`: API, protocolo em tempo real, operacao e matriz de aceite.

O deploy atual usa uma instancia autoritativa do servidor e SQLite persistente. Nao escale o container `server` horizontalmente sem antes migrar a coordenacao de prazos e o banco, conforme explicado no [relatorio de capacidade](./requisitos-infraestrutura-our-werewolf.pdf).

## Pre-requisitos

### Execucao local

- Node.js 24 ou superior.
- npm 11 ou superior.
- OpenSSL para gerar o segredo de sessao, ou outro gerador criptografico.

### Docker Compose

- Docker com Compose.
- Portas `8080` e, somente no desenvolvimento sem Docker, `3001` e `5173` livres.

## Executar localmente

1. Instale as dependencias:

```sh
npm ci
```

2. Crie o arquivo de ambiente:

```sh
cp .env.example .env
```

3. Substitua o valor de `SESSION_SECRET` em `.env` por um segredo com pelo menos 32 caracteres. Um valor pode ser gerado com:

```sh
openssl rand -hex 32
```

Para desenvolvimento local, mantenha:

```dotenv
ALLOWED_ORIGINS=http://localhost:5173
COOKIE_SECURE=false
DATABASE_PATH=./data/our-werewolf.sqlite
```

4. Carregue as variaveis no terminal e inicie cliente e servidor:

```sh
set -a
source .env
set +a
npm run dev
```

5. Abra:

- Aplicacao: `http://localhost:5173`
- API e WebSocket: `http://localhost:3001`
- Health check: `http://localhost:3001/health`
- Metricas operacionais: `http://localhost:3001/metrics`

O Vite encaminha `/api` e `/ws` para o servidor. O banco e suas migracoes sao criados automaticamente no primeiro inicio.

## Executar com Docker Compose

1. Prepare o ambiente:

```sh
cp .env.example .env
```

2. Para uso local com HTTP, configure pelo menos:

```dotenv
SESSION_SECRET=troque-por-um-segredo-com-mais-de-32-caracteres
PUBLIC_ORIGIN=http://localhost:8080
COOKIE_SECURE=false
```

3. Valide, construa e inicie os containers:

```sh
docker compose --env-file .env convert
docker compose --env-file .env build
docker compose --env-file .env up -d
```

4. Verifique a implantacao:

```sh
curl -fsS http://localhost:8080/api/health
npm run smoke:api
```

5. Abra `http://localhost:8080`.

O Compose inicia:

- `web`: Nginx na porta `8080`, servindo a PWA e encaminhando API/WebSocket.
- `server`: Node.js na rede interna, executando regras, prazos e persistencia.
- `game-data`: volume com `/data/our-werewolf.sqlite`.

### Parar os containers

Preservando o banco:

```sh
docker compose --env-file .env down
```

Removendo tambem o volume e todos os dados locais:

```sh
docker compose --env-file .env down -v
```

## Configuracao de producao

Em uma URL HTTPS, altere obrigatoriamente:

```dotenv
PUBLIC_ORIGIN=https://werewolf.example.com
COOKIE_SECURE=true
SESSION_SECRET=um-segredo-aleatorio-exclusivo-do-ambiente
```

O TLS deve terminar em um proxy ou load balancer confiavel na frente da porta `8080`. Preserve os cabecalhos de WebSocket e o `Origin` original. Mantenha somente uma replica do servidor enquanto o projeto usar SQLite e um executor de prazos local.

O runbook completo esta em [`docs/operations.md`](./docs/operations.md).

## Variaveis de ambiente

| Variavel               | Padrao                       | Uso                                                      |
| ---------------------- | ---------------------------- | -------------------------------------------------------- |
| `PORT`                 | `3001`                       | Porta interna do servidor.                               |
| `DATABASE_PATH`        | `./data/our-werewolf.sqlite` | Arquivo SQLite persistente.                              |
| `SESSION_SECRET`       | obrigatoria                  | Assina/resume sessoes anonimas; minimo de 32 caracteres. |
| `ALLOWED_ORIGINS`      | `http://localhost:5173`      | Origens aceitas diretamente pelo servidor.               |
| `PUBLIC_ORIGIN`        | `http://localhost:8080`      | Origem publica usada pelo Compose.                       |
| `COOKIE_SECURE`        | obrigatoria no Compose       | `false` em HTTP local e `true` em HTTPS.                 |
| `SESSION_TTL_SECONDS`  | `604800`                     | Duracao da sessao anonima.                               |
| `CREATE_RATE_LIMIT`    | `10`                         | Criacoes permitidas por janela e IP.                     |
| `JOIN_RATE_LIMIT`      | `30`                         | Tentativas de entrada por janela, IP e sala.             |
| `RATE_LIMIT_WINDOW_MS` | `60000`                      | Janela dos limites de taxa.                              |
| `DEADLINE_POLL_MS`     | `1000`                       | Frequencia do executor de prazos.                        |

## Qualidade e testes

Verificacao completa de formato, lint, tipos, testes e build:

```sh
npm run verify
```

Outros comandos:

```sh
npm test                 # testes unitarios e de integracao
npm run test:e2e         # Playwright: Chrome Android e WebKit iOS
npm run test:watch       # testes em modo observacao
npm run build            # build de producao
npm run smoke:api        # smoke test contra http://localhost:8080
```

O Playwright requer Chrome instalado e o WebKit do Playwright:

```sh
npx playwright install webkit
```

## Capacidade do servidor

O PDF [`requisitos-infraestrutura-our-werewolf.pdf`](./requisitos-infraestrutura-our-werewolf.pdf) apresenta estimativas de CPU, memoria, armazenamento e rede para 20, 100, 500, 1.000 e 2.500 jogadores simultaneos, alem dos limites da arquitetura SQLite.

Os numeros sao pontos de partida conservadores, nao resultados de benchmark. Antes de um evento real, execute teste de carga com a mesma regiao, maquina, proxy, TLS e volume que serao usados em producao.

## Solucao de problemas

### `SESSION_SECRET must contain at least 32 characters`

Carregue `.env` no terminal ou informe `SESSION_SECRET` ao Compose.

### Requisicao rejeitada por origem

Confirme que `ALLOWED_ORIGINS` no modo local ou `PUBLIC_ORIGIN` no Compose corresponde exatamente ao endereco aberto no navegador, incluindo protocolo e porta.

### Cookie nao funciona localmente

Use `COOKIE_SECURE=false` somente em HTTP local. Em producao HTTPS, use `COOKIE_SECURE=true`.

### Porta ocupada

Altere `PORT` para o servidor local ou o mapeamento `8080:8080` no Compose. Atualize tambem a origem permitida quando a porta publica mudar.

### Reiniciar ou limpar o banco local

O modo local grava em `./data/our-werewolf.sqlite`. O Compose grava no volume `game-data`. Remover esses dados apaga salas e partidas.
