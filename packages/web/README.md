# @withinmeans/web

The React app (Vite). Sign-in against Cognito, then pages that call the API through tRPC.

## Run it

```bash
pnpm dev
```

`pnpm dev` serves the app on http://localhost:5173. `/api` is proxied to the deployed dev site
(`dev.within.doroshenk.com`), so you need the dev stacks deployed.

Two build-time variables say which Cognito pool to sign in to. They identify the pool and are not
secrets. They are the `UserPoolId` and `UserPoolClientId` outputs of the stage's `AuthStack`
(AWS console: CloudFormation → the Auth stack → Outputs, or Cognito → User pools → the pool).
Put them in `packages/web/.env.local` (git-ignored):

```
VITE_USER_POOL_ID=us-east-2_xxxxxxxxx
VITE_USER_POOL_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
```

## Notes

- Colours live only in `src/theme/tokens.ts` (spec §7); `main.tsx` injects them as `--color-*` CSS
  variables.
- Sign-up in the browser is a stub on purpose: Cognito `SignUp` would reveal which emails have
  accounts. P1-05 routes it through the API.
- The API verifies the Cognito **access** token, so that is what `trpc.ts` sends.
