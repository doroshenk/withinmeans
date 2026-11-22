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
export function assertCanWrite(_ctx: HouseholdContext): void {
  throw new Error('not implemented');
}
