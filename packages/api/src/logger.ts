export type Fields = Record<string, unknown>;

export interface Logger {
  info(message: string, fields?: Fields): void;
  error(message: string, fields?: Fields): void;
}

/** Returns a copy of `value` with every money field and request/response body removed. */
export function scrub(_value: unknown): unknown {
  throw new Error('not implemented');
}

/** One JSON line per call, passed to `write` (the Lambda runtime sends stdout to CloudWatch). */
export function createLogger(_write: (line: string) => void): Logger {
  throw new Error('not implemented');
}
