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

/** The row does not exist in the caller's household (another household's ids look the same). */
export class NotFound extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFound';
  }
}

/** The change would break a uniqueness rule (e.g. a category name already used, ignoring case). */
export class Conflict extends Error {
  constructor(message = 'Conflict') {
    super(message);
    this.name = 'Conflict';
  }
}

/** The input breaks a business rule the database also checks (e.g. due day outside 1..28). */
export class InvalidInput extends Error {
  constructor(message = 'Invalid input') {
    super(message);
    this.name = 'InvalidInput';
  }
}
