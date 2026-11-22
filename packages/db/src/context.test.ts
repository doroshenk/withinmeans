import { describe, expect, it } from 'vitest';
import { assertCanWrite, Forbidden, type HouseholdContext } from './context.js';

const ctx = (role: HouseholdContext['role']): HouseholdContext => ({
  householdId: 'h',
  userId: 'u',
  role,
});

describe('assertCanWrite', () => {
  it('throws Forbidden for the view role', () => {
    expect(() => assertCanWrite(ctx('view'))).toThrow(Forbidden);
  });
  it.each(['owner', 'full'] as const)('allows %s', (role) => {
    expect(() => assertCanWrite(ctx(role))).not.toThrow();
  });
});
