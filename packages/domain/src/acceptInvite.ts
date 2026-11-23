import { z } from 'zod';
import { loginFields } from './signUp';

/** Spec §3, the partner accepting an invite: the secret token plus the partner's own login. */
export const acceptInviteInput = z.object({ token: z.string().min(1), ...loginFields });

export type AcceptInviteInput = z.infer<typeof acceptInviteInput>;
