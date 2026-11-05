import type { ApiErrorCode } from './contracts.js';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: Record<string, string | number | boolean>,
  ) {
    super(message);
  }
}

export function assert(
  condition: unknown,
  status: number,
  code: ApiErrorCode,
  message: string,
): asserts condition {
  if (!condition) throw new HttpError(status, code, message);
}
