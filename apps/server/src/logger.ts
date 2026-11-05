const SECRET_KEY =
  /(authorization|cookie|credential|password|secret|session|token|role|target|payload)/i;

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogWriter = (line: string) => void;

function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (Array.isArray(value)) return value.map((item) => redact(item, seen));
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SECRET_KEY.test(key) ? '[redacted]' : redact(item, seen),
    ]),
  );
}

export type Logger = {
  log(level: LogLevel, event: string, fields?: Record<string, unknown>): void;
};

export function createLogger(
  writer: LogWriter = (line) => process.stdout.write(`${line}\n`),
): Logger {
  return {
    log(level, event, fields = {}) {
      writer(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level,
          event,
          ...(redact(fields) as object),
        }),
      );
    },
  };
}
