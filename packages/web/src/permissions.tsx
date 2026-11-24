import type { ReactNode } from 'react';

export type Role = 'owner' | 'full' | 'view';

export function RoleProvider(_props: { role: Role | undefined; children: ReactNode }): ReactNode {
  throw new Error('not implemented');
}

export function useCan(): { write: boolean } {
  throw new Error('not implemented');
}
