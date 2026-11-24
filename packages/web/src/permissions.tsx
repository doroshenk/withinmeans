import { createContext, useContext, type ReactNode } from 'react';

export type Role = 'owner' | 'full' | 'view';

const RoleContext = createContext<Role | undefined>(undefined);

/** Provides the signed-in member's role (from `me`) to everything below it. */
export function RoleProvider({
  role,
  children,
}: {
  role: Role | undefined;
  children: ReactNode;
}): ReactNode {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>;
}

/**
 * Spec §3: what the signed-in member may do. Hide create/edit/delete controls unless `write`.
 * Unknown role (loading, no household, no provider) means no write: the API enforces it anyway.
 */
export function useCan(): { write: boolean } {
  const role = useContext(RoleContext);
  return { write: role === 'owner' || role === 'full' };
}
