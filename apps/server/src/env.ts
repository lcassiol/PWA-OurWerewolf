export type ServerConfig = {
  port: number;
  databasePath: string;
  allowedOrigins: ReadonlySet<string>;
  sessionSecret: string;
  cookieSecure: boolean;
  sessionTtlSeconds: number;
  createRateLimit: number;
  joinRateLimit: number;
  rateLimitWindowMs: number;
  deadlinePollMs: number;
};

function integer(
  name: string,
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function boolean(
  name: string,
  value: string | undefined,
  fallback: boolean,
): boolean {
  if (value === undefined) return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be true or false`);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const sessionSecret = env.SESSION_SECRET;
  if (!sessionSecret || sessionSecret.length < 32) {
    throw new Error('SESSION_SECRET must contain at least 32 characters');
  }

  const origins = (env.ALLOWED_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (
    origins.length === 0 ||
    origins.some((origin) => {
      try {
        return new URL(origin).origin !== origin;
      } catch {
        return true;
      }
    })
  ) {
    throw new Error(
      'ALLOWED_ORIGINS must be a comma-separated list of URL origins',
    );
  }

  return {
    port: integer('PORT', env.PORT, 3001, 0, 65_535),
    databasePath: env.DATABASE_PATH ?? './data/our-werewolf.sqlite',
    allowedOrigins: new Set(origins),
    sessionSecret,
    cookieSecure: boolean(
      'COOKIE_SECURE',
      env.COOKIE_SECURE,
      env.NODE_ENV === 'production',
    ),
    sessionTtlSeconds: integer(
      'SESSION_TTL_SECONDS',
      env.SESSION_TTL_SECONDS,
      604_800,
      300,
      2_592_000,
    ),
    createRateLimit: integer(
      'CREATE_RATE_LIMIT',
      env.CREATE_RATE_LIMIT,
      10,
      1,
      10_000,
    ),
    joinRateLimit: integer(
      'JOIN_RATE_LIMIT',
      env.JOIN_RATE_LIMIT,
      30,
      1,
      10_000,
    ),
    rateLimitWindowMs: integer(
      'RATE_LIMIT_WINDOW_MS',
      env.RATE_LIMIT_WINDOW_MS,
      60_000,
      1_000,
      3_600_000,
    ),
    deadlinePollMs: integer(
      'DEADLINE_POLL_MS',
      env.DEADLINE_POLL_MS,
      1_000,
      50,
      60_000,
    ),
  };
}
