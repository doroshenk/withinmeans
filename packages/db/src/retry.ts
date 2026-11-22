export interface RetryOptions {
  maxTries: number;
}

/** Runs fn, retrying on DSQL's optimistic-concurrency (serialization) error. */
export async function withRetry<T>(_fn: () => Promise<T>, _opts: RetryOptions): Promise<T> {
  throw new Error('not implemented');
}
