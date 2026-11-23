import { z } from 'zod';

/** Spec §3, the partner accepting an invite: the secret token plus the partner's own login. */
export const acceptInviteInput = z.any();

export type AcceptInviteInput = {
  token: string;
  name: string;
  email: string;
  password: string;
};
