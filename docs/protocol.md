# Realtime protocol

## Connection

Connect to `ws(s)://HOST/ws?room=ABCD` with the `ow_session` cookie issued by HTTP and an exact allowed `Origin`. Room codes locate rooms but do not authenticate users. Missing, expired, removed, or cross-room credentials are rejected before WebSocket upgrade.

Using `ws` 8.18.3 from Node.js:

```js
import WebSocket from 'ws';

const socket = new WebSocket('ws://localhost:3001/ws?room=ABCD', {
  headers: {
    Origin: 'http://localhost:5173',
    Cookie: 'ow_session=opaque-cookie-value',
  },
});

socket.on('message', (data) => {
  const event = JSON.parse(data.toString());
  if (event.type === 'snapshot') console.log(event.snapshot.public.version);
});

socket.on('open', () => socket.send(JSON.stringify({ type: 'refresh' })));
```

Browsers attach the cookie automatically when configured with the same site and HTTPS policy. The credential must not be placed in the URL, messages, local storage, logs, or analytics.

## Server events

```ts
type ServerEvent =
  | { type: 'connection'; status: 'connected' | 'disconnected' }
  | { type: 'snapshot'; snapshot: GameSnapshot }
  | {
      type: 'error';
      error: { code: string; message: string; details?: object };
    };
```

On connection the server sends `connection: connected` followed by a full recipient-specific snapshot. It sends another full snapshot after public state, presence, accepted commands, or authoritative phase transitions change. Broadcasts are room-isolated, and each socket receives a separately constructed private projection. The server sends WebSocket ping frames at an interval below common proxy idle timeouts; clients must permit normal automatic pong handling.

The only client WebSocket message is:

```json
{ "type": "refresh" }
```

It requests a complete current projection. Game commands use HTTP so retries have explicit idempotency and status semantics.

## Snapshot boundaries

- `public`: room code/status, monotonic version, round, phase, absolute ISO-8601 deadline, public player state/settings/announcements, and main winner.
- `private`: only the authenticated participant's role, alignment, objective, knowledge, resources, available action, optional alternative actions, and personal-win status.
- `host`: lobby controls and non-secret blockers only. Being host grants no extra role visibility.
- `finalRoles`: omitted until the immutable finished state, then contains the complete reveal and winner flags.

Clients must never infer permissions from role names. They render and submit only `private.availableAction` and its advertised `alternatives`. A deadline is display input, not transition authority.

## Versions, commands, and recovery

Every HTTP game command includes:

```json
{
  "commandId": "stable-client-generated-id",
  "expectedVersion": 12,
  "expectedPhase": "night",
  "action": "seer-inspect",
  "targets": ["participant-uuid"]
}
```

- Reusing a processed `commandId` returns success with the current snapshot and does not repeat effects.
- A mismatched `expectedVersion` returns `stale_command`; a mismatched or expired phase returns `phase_closed`.
- After either conflict, discard local assumptions and use the authorized `snapshot` included in the 409 response, or fall back to `GET /rooms/:code/snapshot` when no snapshot is present.
- Versions can advance because of commands, presence, or phases. Clients must replace state with the highest complete snapshot rather than merge private fields across identities.

On disconnect, show reconnecting/offline and block commands that cannot be confirmed. Reconnect with normal WebSocket backoff, then send `refresh` or fetch the snapshot. `POST /rooms/:code/reconnect` rotates a still-valid opaque credential and returns a fresh snapshot. Rotation immediately closes sockets authenticated with the prior credential. Expired, invalidated, removed, and expired-room sessions are rechecked during broadcasts, client messages, and heartbeat ticks and are closed with application code `4001`. Suspended tabs must recalculate countdowns from `snapshot.public.deadline`; they must not replay queued commands.

The server preserves a participant slot after game start. HTTP creation, join, or reconnect does not mark presence connected. Presence is connected only while at least one authenticated socket exists, becomes disconnected after the final socket closes, and is reset safely after a server restart.

## Night ordering

`first-night` and `night` remain the only public night phases. The server persists private internal stages with independent deadlines: first-night Cupid setup when applicable, pack voting and target lock, then the remaining night actions. A stage advances early only after every currently required actor submits, including an explicit empty-target abstention; disconnected actors remain eligible until that stage deadline. A deadline advances one internal stage rather than skipping the remaining actors. Witch actions are advertised only after the pack target has locked, and that target is included only in the Witch's private projection.
