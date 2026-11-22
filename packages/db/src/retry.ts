export interface RetryOptions {
  maxTries: number;
  /** Base delay between tries; grows linearly. Default 10 ms. */
  delayMs?: number;
}

/** Postgres serialization failure, plus DSQL's optimistic-concurrency codes. */
const RETRYABLE = new Set(['40001', 'OC000', 'OC001']);

function isRetryable(err: unknown): boolean {
  return (
    typeof err === 'object' && err !== null && 'code' in err && RETRYABLE.has(String(err.code))
  );
}

/** Runs fn, retrying on DSQL's optimistic-concurrency (serialization) error. */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  const delayMs = opts.delayMs ?? 10;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isRetryable(err) || attempt >= opts.maxTries) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }
}
