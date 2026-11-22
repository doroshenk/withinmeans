export type Fields = Record<string, unknown>;

export interface Logger {
  info(message: string, fields?: Fields): void;
  error(message: string, fields?: Fields): void;
}

/** Money fields (`*_cents`, `*Cents`) and request/response bodies never reach the log. */
const MONEY_KEY = /(_cents|Cents)$/;
const BODY_KEYS = new Set(['body', 'requestBody', 'responseBody', 'input', 'rawInput']);

/** Returns a copy of `value` with every money field and request/response body removed. */
export function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !MONEY_KEY.test(key) && !BODY_KEYS.has(key))
      .map(([key, v]) => [key, scrub(v)]),
  );
}

/** One JSON line per call, passed to `write` (the Lambda runtime sends stdout to CloudWatch). */
export function createLogger(write: (line: string) => void): Logger {
  const emit = (level: string, message: string, fields: Fields = {}): void => {
    write(JSON.stringify({ level, message, ...(scrub(fields) as Fields) }));
  };
  return {
    info: (message, fields) => emit('info', message, fields),
    error: (message, fields) => emit('error', message, fields),
  };
}
