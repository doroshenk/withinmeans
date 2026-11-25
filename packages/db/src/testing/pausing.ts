import type { Database } from '../db.js';

/**
 * `db` whose first transaction stops just before committing, until `release` is called. `reached`
 * resolves when it stops.
 */
export function pausingBeforeCommit(db: Database) {
  let release = () => {};
  let arrived = () => {};
  const released = new Promise<void>((resolve) => (release = resolve));
  const reached = new Promise<void>((resolve) => (arrived = resolve));
  let paused = false;
  const proxy = new Proxy(db, {
    get(target, prop) {
      if (prop !== 'transaction') {
        const value = Reflect.get(target, prop) as unknown;
        return typeof value === 'function' ? (value as () => unknown).bind(target) : value;
      }
      return () => ({
        execute: <T>(fn: (trx: never) => Promise<T>) =>
          target.transaction().execute(async (trx) => {
            const result = await fn(trx as never);
            if (!paused) {
              paused = true;
              arrived();
              await released;
            }
            return result;
          }),
      });
    },
  });
  return { db: proxy, reached, release: () => release() };
}
