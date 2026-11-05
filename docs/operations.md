# Operations runbook

## Local development

Requirements: Node.js 24 and npm 11.

```sh
cp .env.example .env
export SESSION_SECRET='replace-with-at-least-32-random-characters'
npm ci
npm run verify
npm run dev
```

The web client runs at `http://localhost:5173` and proxies `/api` and `/ws` to the server at `http://localhost:3001`. The server creates the SQLite parent directory and applies additive migrations on startup.

## Container deployment

The Compose deployment runs one authoritative server/deadline executor and one Nginx web proxy. Do not scale the server beyond one replica until a distributed deadline lease is implemented.

```sh
export SESSION_SECRET="$(openssl rand -hex 32)"
export PUBLIC_ORIGIN='https://werewolf.example.com'
export COOKIE_SECURE=true
docker compose convert
docker compose build
docker compose up -d
curl -fsS http://localhost:8080/api/health
npm run smoke:api
```

Terminate TLS in a trusted reverse proxy or load balancer in front of port 8080. Forward the original `Origin`, WebSocket upgrade headers and HTTPS scheme. `PUBLIC_ORIGIN` must exactly match the browser origin; production must use `COOKIE_SECURE=true`.

The named `game-data` volume contains `/data/our-werewolf.sqlite`. Back it up before every release and before any manual database operation.

## Release verification

1. Run `npm ci && npm run verify` from a clean checkout.
2. Run `docker compose convert` and build both images.
3. Back up the SQLite database.
4. Start the server and wait for its health check before switching web traffic.
5. Verify `GET /api/health`, room creation, a second-device join and a WebSocket snapshot.
6. Verify manifest and service-worker responses over HTTPS, then install on a test Android and iOS device.
7. Monitor `httpErrors`, `websocketActive`, rejected commands and phase transitions without recording request bodies.

## Restart and recovery

The open phase and its absolute deadline are persisted. Restart only one server process at a time. On startup, the deadline executor advances expired phases with an atomic claim; duplicate ticks cannot advance the same phase twice.

```sh
docker compose restart server
curl -fsS http://localhost:8080/api/health
```

Clients reconnect automatically and request a fresh recipient-specific snapshot. Never replay commands from logs or an offline queue.

## Rollback

1. Stop creation of new rooms at the edge when possible.
2. Back up the current database and inspect active games.
3. Deploy the previous application version only if it supports the current additive schema.
4. Prefer leaving added tables and columns in place. Run `npm run migrate -w @our-werewolf/server -- down 1` only for a controlled discard of the release with traffic stopped.
5. Restore the database backup only when accepting loss of all activity since that backup.

## Incident investigation

- Use event names and opaque room/game/participant IDs to correlate activity.
- Do not add cookies, session hashes, roles, targets, commands or private snapshots to logs or analytics.
- Repeated `rate_limited` responses indicate enumeration or automation; tune limits at the edge before increasing application limits.
- Rising `phase_closed` or `stale_command` counts with reconnects usually indicate unstable mobile networks or suspended tabs.
- A growing set of overdue open phases requires stopping new rooms, checking the single deadline executor and restarting the server after a database backup.
