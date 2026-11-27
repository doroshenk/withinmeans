import { useCallback, useEffect, useRef, useState } from 'react';
import { useSavedByQuickAdd } from './context';

export type Lists<T> = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; data: T };

/**
 * What a form needs before it can show (its categories, accounts, paychecks or cards), loaded
 * again after each change. A failed reload keeps what is shown.
 */
export function useLists<T>(fetch: () => Promise<T>): Lists<T> {
  const [lists, setLists] = useState<Lists<T>>({ kind: 'loading' });
  const latest = useRef(0);
  // The first fetch function is as good as any later one: a panel is remade for each type.
  const fetchRef = useRef(fetch);

  const load = useCallback(() => {
    const mine = ++latest.current;
    fetchRef.current().then(
      (data) => latest.current === mine && setLists({ kind: 'ready', data }),
      () =>
        latest.current === mine &&
        setLists((now) => (now.kind === 'ready' ? now : { kind: 'error' })),
    );
  }, []);

  useEffect(() => {
    load();
    const requests = latest;
    return () => {
      // An answer that arrives after the panel is gone is dropped.
      requests.current += 1;
    };
  }, [load]);
  useSavedByQuickAdd(load);

  return lists;
}
