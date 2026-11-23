import type { HouseholdContext, Role } from '../context.js';
import type { Database } from '../db.js';
import { notImplemented } from './notImplemented.js';

export interface Member {
  userId: string;
  name: string;
  email: string;
  role: Role;
}

export const memberships = {
  list(_db: Database, _ctx: HouseholdContext): Promise<Member[]> {
    return notImplemented();
  },
};
