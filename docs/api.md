# HTTP API and operations

The server requires Node.js 24. All JSON responses set `Cache-Control: no-store`. Mutating requests require an `Origin` exactly listed in `ALLOWED_ORIGINS`; browsers must send credentials.

## Run locally

```sh
export SESSION_SECRET='replace-with-at-least-32-random-characters'
export ALLOWED_ORIGINS='http://localhost:5173'
export COOKIE_SECURE=false
export DATABASE_PATH='./data/our-werewolf.sqlite'
npm run migrate -w @our-werewolf/server
npm run dev -w @our-werewolf/server
```

Production must use HTTPS and `COOKIE_SECURE=true`. Supported variables are:

| Variable               | Default                      | Validation                              |
| ---------------------- | ---------------------------- | --------------------------------------- |
| `PORT`                 | `3001`                       | integer 0-65535                         |
| `DATABASE_PATH`        | `./data/our-werewolf.sqlite` | SQLite file path                        |
| `ALLOWED_ORIGINS`      | `http://localhost:5173`      | comma-separated exact origins           |
| `SESSION_SECRET`       | none                         | required, at least 32 characters        |
| `COOKIE_SECURE`        | true in production           | `true` or `false`                       |
| `SESSION_TTL_SECONDS`  | `604800`                     | 300-2592000                             |
| `CREATE_RATE_LIMIT`    | `10`                         | attempts per window and source address  |
| `JOIN_RATE_LIMIT`      | `30`                         | attempts per room/window/source address |
| `RATE_LIMIT_WINDOW_MS` | `60000`                      | 1000-3600000                            |
| `DEADLINE_POLL_MS`     | `1000`                       | 50-60000                                |

`GET /health` checks database access. `GET /metrics` returns aggregate request, error, connection, command, and transition counters. Neither endpoint emits credentials, payloads, roles, or targets. Rate limiting uses the direct peer address unless that peer is loopback or private; only then is the first valid `X-Forwarded-For` address trusted. Deployments behind a public intermediary must preserve the real private proxy hop instead of exposing the server directly.

## Executable flow

The examples use a cookie jar because the opaque session secret is never returned in JSON.

```sh
API='http://localhost:3001'
ORIGIN='http://localhost:5173'
CODE=$(curl -fsS -c /tmp/werewolf-host.cookies \
  -H "Origin: $ORIGIN" -H 'Content-Type: application/json' \
  -d '{"nickname":"Host"}' "$API/rooms" | node -pe \
  "JSON.parse(require('fs').readFileSync(0)).snapshot.public.roomCode")

curl -fsS -c /tmp/werewolf-player.cookies \
  -H "Origin: $ORIGIN" -H 'Content-Type: application/json' \
  -d '{"nickname":"Player 2"}' "$API/rooms/$CODE/join"

curl -fsS -b /tmp/werewolf-host.cookies \
  -H "Origin: $ORIGIN" -H 'Content-Type: application/json' \
  -X PATCH -d '{"discussionMinutes":5,"allowNoExile":true,"specialRoles":["seer"]}' \
  "$API/rooms/$CODE/settings"

curl -fsS -b /tmp/werewolf-host.cookies \
  -H "Origin: $ORIGIN" -H 'Content-Type: application/json' \
  -X PATCH -d '{"ready":true}' "$API/rooms/$CODE/ready"

curl -fsS -b /tmp/werewolf-host.cookies "$API/rooms/$CODE/snapshot"
```

Repeat join and readiness until 6-20 participants are ready, then start:

```sh
curl -fsS -b /tmp/werewolf-host.cookies \
  -H "Origin: $ORIGIN" -H 'Content-Type: application/json' \
  -X POST -d '{}' "$API/rooms/$CODE/start"
```

Submit only an action advertised by `snapshot.private.availableAction`. `commandId` is stable across retries; version and phase come from the same snapshot.

```sh
curl -fsS -b /tmp/werewolf-player.cookies \
  -H "Origin: $ORIGIN" -H 'Content-Type: application/json' \
  -d '{"commandId":"client-command-0001","expectedVersion":7,"expectedPhase":"voting","action":"day-vote","targets":["participant-uuid"]}' \
  "$API/rooms/$CODE/commands"
```

## Endpoints

| Method and path                        | Authentication      | Purpose                                             |
| -------------------------------------- | ------------------- | --------------------------------------------------- |
| `GET /health`                          | none                | readiness and database check                        |
| `GET /metrics`                         | none                | secret-free process counters                        |
| `GET /session`                         | cookie              | restore the current anonymous room session          |
| `POST /rooms`                          | none, rate limited  | create room and host session                        |
| `POST /rooms/:code/join`               | none, rate limited  | join a lobby and issue session                      |
| `POST /rooms/:code/reconnect`          | cookie              | rotate session and return fresh snapshot            |
| `POST /rooms/:code/return`             | cookie              | reopen a finished room or return the guest home     |
| `DELETE /rooms/:code/session`          | cookie              | leave lobby; a host closes the lobby                |
| `GET /rooms/:code/snapshot`            | cookie              | recipient-filtered current state                    |
| `PATCH /rooms/:code/settings`          | host cookie         | update lobby settings                               |
| `PATCH /rooms/:code/avatar`            | cookie              | choose the authenticated participant's avatar       |
| `PATCH /rooms/:code/ready`             | cookie              | set `{ "ready": boolean }`                          |
| `DELETE /rooms/:code/participants/:id` | self or host cookie | remove lobby participant and invalidate its session |
| `POST /rooms/:code/start`              | host cookie         | atomically freeze and start valid lobby             |
| `POST /rooms/:code/commands`           | cookie              | idempotent game action                              |

Errors have `{ "error": { "code", "message", "details"? } }`. Relevant statuses are 400, 401, 403, 404, 409, 413, and 429. A 429 includes `Retry-After`. A stale or closed-phase command is never applied. Its 409 response also contains a recipient-authorized `snapshot` when the session and room remain valid, so the client can recover without a second request.

Rooms expire at their persisted `expires_at`. Join and authentication close an expired room, invalidate its participant sessions, and return the same not-found or unauthorized result used for any unavailable room.

## Migrations and rollback

Forward migrations are ordered, transactional, and recorded in `schema_migrations`. The nickname correction migration rebuilds the participant table while foreign-key checks are enforced after the copy, then installs active-only nickname uniqueness so a removed lobby participant releases the nickname:

```sh
npm run migrate -w @our-werewolf/server
```

Rollback the most recent migration only during a controlled rollback after disabling traffic and backing up the database:

```sh
npm run migrate -w @our-werewolf/server -- down 1
```

Release procedure: back up the SQLite file, run forward migrations, start one server/deadline-runner process, and verify `/health`. For application rollback, stop new room creation, preserve active games when safe, deploy the previous schema-compatible server, and do not run destructive down migrations unless the release itself is being discarded.

Logs are newline-delimited JSON. Investigate by event name, room/game/participant IDs, status, and counters; never add request bodies, cookies, commands, roles, targets, or private projection fields to logs.
