import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { QuickAddClient } from './types';

export interface QuickAdd {
  client: QuickAddClient;
  /** "View" on an entry just added: show that page at that month ("YYYY-MM"). */
  onView: (route: 'bills' | 'paychecks' | 'recurring', ym?: string) => void;
  /** Counts the changes Quick Add has made. */
  saves: number;
  noteSaved: () => void;
}

const QuickAddContext = createContext<QuickAdd | null>(null);

export type QuickAddProviderProps = Pick<QuickAdd, 'client' | 'onView'> & { children: ReactNode };

/** Spec §5.14: lets the shell's "+ Add" open Quick Add over any page. */
export function QuickAddProvider({ client, onView, children }: QuickAddProviderProps) {
  const [saves, setSaves] = useState(0);
  const value = useMemo(
    () => ({ client, onView, saves, noteSaved: () => setSaves((n) => n + 1) }),
    [client, onView, saves],
  );
  return <QuickAddContext.Provider value={value}>{children}</QuickAddContext.Provider>;
}

/** Null where there is no provider, so "+ Add" has nothing to open. */
export function useQuickAdd(): QuickAdd | null {
  return useContext(QuickAddContext);
}

/** Runs `reload` each time Quick Add changes something, so what is on screen stays true. */
export function useSavedByQuickAdd(reload: () => void): void {
  const saves = useQuickAdd()?.saves ?? 0;
  const seen = useRef(saves);
  const latest = useRef(reload);
  useEffect(() => {
    latest.current = reload;
  });
  useEffect(() => {
    if (saves === seen.current) return;
    seen.current = saves;
    latest.current();
  }, [saves]);
}
