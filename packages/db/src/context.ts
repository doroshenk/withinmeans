export type Role = 'owner' | 'full' | 'view';

export interface HouseholdContext {
  householdId: string;
  userId: string;
  role: Role;
}

export class Forbidden extends Error {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'Forbidden';
  }
}

/** Every repository write calls this first. */
export function assertCanWrite(ctx: HouseholdContext): void {
  if (ctx.role === 'view') throw new Forbidden('View-only members cannot make changes');
}
