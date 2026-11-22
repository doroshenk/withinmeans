import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@withinmeans/api';
import type { AuthClient } from './auth/types';

/**
 * The API client. CloudFront forwards `/api/*` to the API (ADR 0010); every call carries the
 * Cognito access token, which the API verifies. Only the *types* come from `@withinmeans/api`.
 */
export function createApiClient(auth: AuthClient) {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: '/api',
        async headers() {
          const token = await auth.getAccessToken();
          return token ? { authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
}
