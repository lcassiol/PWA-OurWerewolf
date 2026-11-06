import { randomUUID } from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import type { Duplex } from 'node:stream';
import { isIP } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { createDomainAdapter, type DomainAdapter } from './domain-adapter.js';
import { migrateUp } from './db/migrate.js';
import type { ServerConfig } from './env.js';
import { HttpError } from './errors.js';
import { GameService, type Identity } from './game-service.js';
import { createLogger, type Logger } from './logger.js';
import { RateLimiter } from './rate-limit.js';

const COOKIE_NAME = 'ow_session';

export type OperationalMetrics = {
  startedAt: string;
  httpRequests: number;
  httpErrors: number;
  websocketConnections: number;
  websocketActive: number;
};

export type CreateApplicationOptions = {
  config: ServerConfig;
  database?: DatabaseSync;
  logger?: Logger;
  domain?: DomainAdapter;
  now?: () => Date;
  startDeadlineRunner?: boolean;
  generateCode?: () => string;
};

export function createApplication(options: CreateApplicationOptions) {
  const database =
    options.database ?? new DatabaseSync(options.config.databasePath);
  migrateUp(database);
  const logger = options.logger ?? createLogger();
  const service = new GameService({
    database,
    domain: options.domain ?? createDomainAdapter(),
    logger,
    sessionSecret: options.config.sessionSecret,
    sessionTtlSeconds: options.config.sessionTtlSeconds,
    ...(options.now ? { now: options.now } : {}),
    ...(options.generateCode ? { generateCode: options.generateCode } : {}),
  });
  const createLimiter = new RateLimiter(
    options.config.createRateLimit,
    options.config.rateLimitWindowMs,
  );
  const joinLimiter = new RateLimiter(
    options.config.joinRateLimit,
    options.config.rateLimitWindowMs,
  );
  const metrics: OperationalMetrics = {
    startedAt: new Date().toISOString(),
    httpRequests: 0,
    httpErrors: 0,
    websocketConnections: 0,
    websocketActive: 0,
  };
  const sockets = new Map<WebSocket, Identity>();
  const socketAlive = new WeakMap<WebSocket, boolean>();
  const websocketServer = new WebSocketServer({
    noServer: true,
    maxPayload: 4_096,
  });

  function broadcast(roomCode: string): void {
    for (const [socket, identity] of sockets) {
      if (
        identity.roomCode !== roomCode ||
        socket.readyState !== WebSocket.OPEN
      )
        continue;
      if (!service.isIdentityCurrent(identity)) {
        socket.close(4001, 'Session invalid');
        continue;
      }
      try {
        socket.send(
          JSON.stringify({
            type: 'snapshot',
            snapshot: service.project(identity),
          }),
        );
      } catch {
        socket.terminate();
      }
    }
  }
  service.onRoomChanged(broadcast);

  const server = createServer(async (request, response) => {
    const requestId = randomUUID();
    metrics.httpRequests += 1;
    try {
      await route(request, response, requestId);
    } catch (error) {
      metrics.httpErrors += 1;
      const httpError =
        error instanceof HttpError
          ? error
          : new HttpError(500, 'bad_request', 'Internal server error');
      if (!(error instanceof HttpError))
        logger.log('error', 'http.unhandled_error', {
          requestId,
          errorName: error instanceof Error ? error.name : 'unknown',
        });
      sendJson(response, httpError.status, {
        error: {
          code: httpError.code,
          message: httpError.message,
          ...(httpError.details ? { details: httpError.details } : {}),
        },
      });
    }
  });

  async function route(
    request: IncomingMessage,
    response: ServerResponse,
    requestId: string,
  ): Promise<void> {
    const method = request.method ?? 'GET';
    const url = new URL(request.url ?? '/', 'http://server.invalid');
    const origin = request.headers.origin;
    applyCors(response, origin, options.config.allowedOrigins);
    if (method === 'OPTIONS') {
      requireOrigin(origin, options.config.allowedOrigins);
      response.writeHead(204).end();
      return;
    }
    if (url.pathname === '/health' && method === 'GET') {
      const check = database.prepare('SELECT 1 AS ok').get();
      sendJson(response, check ? 200 : 503, {
        status: check ? 'ok' : 'unavailable',
      });
      return;
    }
    if (url.pathname === '/metrics' && method === 'GET') {
      sendJson(response, 200, {
        uptimeSeconds: Math.floor(process.uptime()),
        httpRequests: metrics.httpRequests,
        httpErrors: metrics.httpErrors,
        websocketConnections: metrics.websocketConnections,
        websocketActive: metrics.websocketActive,
        commandsAccepted: service.metrics.commandsAccepted,
        commandsRejected: service.metrics.commandsRejected,
        transitions: service.metrics.transitions,
      });
      return;
    }
    if (url.pathname === '/session' && method === 'GET') {
      const identity = service.authenticate(
        parseCookies(request.headers.cookie)[COOKIE_NAME],
      );
      if (!identity)
        throw new HttpError(
          401,
          'unauthorized',
          'A valid room session is required',
        );
      sendJson(response, 200, { snapshot: service.project(identity) });
      return;
    }
    if (method === 'POST' || method === 'PATCH' || method === 'DELETE')
      requireOrigin(origin, options.config.allowedOrigins);

    if (url.pathname === '/rooms' && method === 'POST') {
      enforceRateLimit(createLimiter, clientAddress(request), response);
      const body = await readJson(request);
      const result = service.createRoom(
        (body as Record<string, unknown>).nickname,
      );
      setSessionCookie(response, result.credential, options.config);
      sendJson(response, 201, { snapshot: result.snapshot });
      return;
    }

    const joinMatch = url.pathname.match(/^\/rooms\/([A-Za-z]{4})\/join$/);
    if (joinMatch && method === 'POST') {
      enforceRateLimit(
        joinLimiter,
        `${clientAddress(request)}:${joinMatch[1]!.toUpperCase()}`,
        response,
      );
      const body = await readJson(request);
      const result = service.joinRoom(
        joinMatch[1]!,
        (body as Record<string, unknown>).nickname,
      );
      setSessionCookie(response, result.credential, options.config);
      sendJson(response, 201, { snapshot: result.snapshot });
      return;
    }

    const roomMatch = url.pathname.match(
      /^\/rooms\/([A-Za-z]{4})(?:\/(snapshot|reconnect|settings|ready|avatar|vote-ready|start|commands|session|return))?$/,
    );
    const removeMatch = url.pathname.match(
      /^\/rooms\/([A-Za-z]{4})\/participants\/([0-9a-f-]{36})$/i,
    );
    const code = (roomMatch?.[1] ?? removeMatch?.[1])?.toUpperCase();
    if (code) {
      const identity = requireIdentity(request, code);
      const resource = roomMatch?.[2];
      if (resource === 'snapshot' && method === 'GET') {
        sendJson(response, 200, { snapshot: service.project(identity) });
        return;
      }
      if (resource === 'reconnect' && method === 'POST') {
        const result = service.reconnect(identity);
        setSessionCookie(response, result.credential, options.config);
        sendJson(response, 200, { snapshot: result.snapshot });
        return;
      }
      if (resource === 'settings' && method === 'PATCH') {
        sendJson(response, 200, {
          snapshot: service.updateSettings(identity, await readJson(request)),
        });
        return;
      }
      if (resource === 'ready' && method === 'PATCH') {
        const body = (await readJson(request)) as Record<string, unknown>;
        sendJson(response, 200, {
          snapshot: service.setReady(identity, body.ready),
        });
        return;
      }
      if (resource === 'avatar' && method === 'PATCH') {
        const body = (await readJson(request)) as Record<string, unknown>;
        sendJson(response, 200, {
          snapshot: service.setAvatar(identity, body.avatarId),
        });
        return;
      }
      if (resource === 'vote-ready' && method === 'POST') {
        sendJson(response, 200, {
          snapshot: service.markReadyForVote(identity),
        });
        return;
      }
      if (resource === 'start' && method === 'POST') {
        sendJson(response, 200, { snapshot: service.startGame(identity) });
        return;
      }
      if (resource === 'commands' && method === 'POST') {
        try {
          const result = service.submitCommand(
            identity,
            await readJson(request),
          );
          sendJson(response, 200, {
            accepted: true,
            duplicate: result.duplicate,
            snapshot: result.snapshot,
          });
        } catch (error) {
          if (
            error instanceof HttpError &&
            (error.code === 'stale_command' || error.code === 'phase_closed')
          ) {
            let snapshot;
            try {
              snapshot = service.project(identity);
            } catch {
              snapshot = undefined;
            }
            sendJson(response, error.status, {
              error: {
                code: error.code,
                message: error.message,
                ...(error.details ? { details: error.details } : {}),
              },
              ...(snapshot ? { snapshot } : {}),
            });
          } else {
            throw error;
          }
        }
        return;
      }
      if (resource === 'session' && method === 'DELETE') {
        service.leaveRoom(identity);
        clearSessionCookie(response, options.config);
        response.writeHead(204).end();
        return;
      }
      if (resource === 'return' && method === 'POST') {
        const snapshot = service.returnAfterGame(identity);
        if (!snapshot) {
          clearSessionCookie(response, options.config);
          response.writeHead(204).end();
          return;
        }
        sendJson(response, 200, { snapshot });
        return;
      }
      if (removeMatch && method === 'DELETE') {
        const result = service.removeParticipant(identity, removeMatch[2]!);
        if (result.clearedSelf) clearSessionCookie(response, options.config);
        sendJson(response, 200, {
          removed: true,
          snapshot: service.project(identity),
        });
        return;
      }
    }
    logger.log('warn', 'http.not_found', { requestId, method });
    throw new HttpError(404, 'not_found', 'Route not found');
  }

  function requireIdentity(request: IncomingMessage, code: string): Identity {
    const identity = service.authenticate(
      parseCookies(request.headers.cookie)[COOKIE_NAME],
      code,
    );
    if (!identity)
      throw new HttpError(
        401,
        'unauthorized',
        'A valid room session is required',
      );
    return identity;
  }

  server.on('upgrade', (request, socket, head) => {
    const reject = (status: number, message: string) =>
      rejectUpgrade(socket, status, message);
    try {
      const url = new URL(request.url ?? '/', 'http://server.invalid');
      if (url.pathname !== '/ws') return reject(404, 'Not Found');
      requireOrigin(request.headers.origin, options.config.allowedOrigins);
      const code = url.searchParams.get('room')?.toUpperCase();
      if (!code || !/^[A-Z]{4}$/.test(code)) return reject(400, 'Bad Request');
      const identity = service.authenticate(
        parseCookies(request.headers.cookie)[COOKIE_NAME],
        code,
      );
      if (!identity) return reject(401, 'Unauthorized');
      websocketServer.handleUpgrade(request, socket, head, (websocket) => {
        websocketServer.emit('connection', websocket, request, identity);
      });
    } catch (error) {
      reject(
        error instanceof HttpError ? error.status : 500,
        'Upgrade Rejected',
      );
    }
  });

  websocketServer.on(
    'connection',
    (socket: WebSocket, _request: IncomingMessage, identity: Identity) => {
      socketAlive.set(socket, true);
      metrics.websocketConnections += 1;
      metrics.websocketActive += 1;
      service.setConnected(identity, true);
      sockets.set(socket, identity);
      socket.send(JSON.stringify({ type: 'connection', status: 'connected' }));
      socket.send(
        JSON.stringify({
          type: 'snapshot',
          snapshot: service.project(identity),
        }),
      );
      logger.log('info', 'websocket.connected', {
        roomId: identity.roomId,
        participantId: identity.participantId,
      });

      socket.on('message', (data, isBinary) => {
        if (!service.isIdentityCurrent(identity)) {
          socket.close(4001, 'Session invalid');
          return;
        }
        const messageBuffer = websocketBuffer(data);
        if (isBinary || messageBuffer.byteLength > 4_096)
          return socket.close(1003, 'Unsupported message');
        try {
          const message = JSON.parse(messageBuffer.toString('utf8')) as {
            type?: unknown;
          };
          if (message.type !== 'refresh') throw new Error('unsupported');
          socket.send(
            JSON.stringify({
              type: 'snapshot',
              snapshot: service.project(identity),
            }),
          );
        } catch {
          socket.send(
            JSON.stringify({
              type: 'error',
              error: {
                code: 'bad_request',
                message: 'Only refresh messages are supported',
              },
            }),
          );
        }
      });
      socket.on('pong', () => socketAlive.set(socket, true));
      socket.on('error', () => undefined);
      socket.on('close', () => {
        sockets.delete(socket);
        metrics.websocketActive -= 1;
        if (
          ![...sockets.values()].some(
            (current) => current.participantId === identity.participantId,
          )
        )
          service.setConnected(identity, false);
        logger.log('info', 'websocket.disconnected', {
          roomId: identity.roomId,
          participantId: identity.participantId,
        });
      });
    },
  );

  const heartbeatTimer = setInterval(
    () => {
      for (const [socket, identity] of sockets) {
        if (!service.isIdentityCurrent(identity)) {
          socket.close(4001, 'Session invalid');
          continue;
        }
        if (socketAlive.get(socket) === false) {
          socket.terminate();
          continue;
        }
        socketAlive.set(socket, false);
        socket.ping();
      }
    },
    Math.min(
      15_000,
      Math.max(1_000, (options.config.sessionTtlSeconds * 1_000) / 3),
    ),
  );
  heartbeatTimer.unref();

  const deadlineTimer =
    options.startDeadlineRunner === false
      ? undefined
      : setInterval(() => {
          try {
            service.runDuePhases();
          } catch (error) {
            logger.log('error', 'deadline.tick_failed', {
              errorName: error instanceof Error ? error.name : 'unknown',
            });
          }
        }, options.config.deadlinePollMs);
  deadlineTimer?.unref();

  return {
    server,
    service,
    database,
    metrics,
    async close(): Promise<void> {
      if (deadlineTimer) clearInterval(deadlineTimer);
      clearInterval(heartbeatTimer);
      for (const socket of sockets.keys()) socket.terminate();
      await new Promise<void>((resolve) =>
        websocketServer.close(() => resolve()),
      );
      if (server.listening)
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
    },
  };
}

function requireOrigin(
  origin: string | undefined,
  allowed: ReadonlySet<string>,
): void {
  if (!origin || !allowed.has(origin))
    throw new HttpError(403, 'forbidden', 'Request origin is not allowed');
}

function applyCors(
  response: ServerResponse,
  origin: string | undefined,
  allowed: ReadonlySet<string>,
): void {
  if (origin && allowed.has(origin)) {
    response.setHeader('access-control-allow-origin', origin);
    response.setHeader('access-control-allow-credentials', 'true');
    response.setHeader('vary', 'Origin');
  }
  response.setHeader(
    'access-control-allow-methods',
    'GET, POST, PATCH, DELETE, OPTIONS',
  );
  response.setHeader('access-control-allow-headers', 'content-type');
  response.setHeader('cache-control', 'no-store');
  response.setHeader('x-content-type-options', 'nosniff');
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request as AsyncIterable<unknown>) {
    const buffer = requestBuffer(chunk);
    size += buffer.length;
    if (size > 32_768)
      throw new HttpError(413, 'bad_request', 'Request body is too large');
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new HttpError(400, 'bad_request', 'Request body must be valid JSON');
  }
}

function requestBuffer(value: unknown): Buffer {
  if (typeof value === 'string') return Buffer.from(value);
  if (value instanceof Uint8Array) return Buffer.from(value);
  throw new HttpError(
    400,
    'bad_request',
    'Request body contains unsupported data',
  );
}

function websocketBuffer(data: RawData): Buffer {
  if (Array.isArray(data)) return Buffer.concat(data);
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  return data;
}

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  if (response.headersSent) return;
  const value = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(value),
  });
  response.end(value);
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').flatMap((item) => {
      const separator = item.indexOf('=');
      if (separator < 1) return [];
      try {
        return [
          [
            item.slice(0, separator).trim(),
            decodeURIComponent(item.slice(separator + 1).trim()),
          ],
        ];
      } catch {
        return [];
      }
    }),
  );
}

function setSessionCookie(
  response: ServerResponse,
  credential: string,
  config: ServerConfig,
): void {
  response.setHeader(
    'set-cookie',
    `${COOKIE_NAME}=${encodeURIComponent(credential)}; Path=/; Max-Age=${config.sessionTtlSeconds}; HttpOnly; SameSite=Strict${config.cookieSecure ? '; Secure' : ''}`,
  );
}

function clearSessionCookie(
  response: ServerResponse,
  config: ServerConfig,
): void {
  response.setHeader(
    'set-cookie',
    `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${config.cookieSecure ? '; Secure' : ''}`,
  );
}

export function clientAddress(request: IncomingMessage): string {
  const direct = request.socket.remoteAddress ?? 'unknown';
  if (!isTrustedProxyAddress(direct)) return direct;
  const forwarded = request.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)
    ?.split(',', 1)[0]
    ?.trim();
  return first && isIP(first) ? first : direct;
}

function isTrustedProxyAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^::ffff:/, '');
  if (normalized === '::1' || normalized === '127.0.0.1') return true;
  if (isIP(normalized) === 4) {
    const [first, second] = normalized.split('.').map(Number);
    return (
      first === 10 ||
      first === 127 ||
      (first === 172 && second !== undefined && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    );
  }
  return (
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb')
  );
}

function enforceRateLimit(
  limiter: RateLimiter,
  key: string,
  response: ServerResponse,
): void {
  const result = limiter.consume(key);
  if (result.allowed) return;
  response.setHeader('retry-after', result.retryAfterSeconds);
  throw new HttpError(429, 'rate_limited', 'Too many attempts', {
    retryAfterSeconds: result.retryAfterSeconds,
  });
}

function rejectUpgrade(socket: Duplex, status: number, message: string): void {
  if (socket.destroyed) return;
  socket.write(
    `HTTP/1.1 ${status} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
  );
  socket.destroy();
}
