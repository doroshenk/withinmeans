/** Shown instead of a blank page when the build-time Cognito variables are not set. */
export function ConfigMissing({ missing }: { missing: string[] }) {
  return (
    <main className="hello">
      <h1>Almost there</h1>
      <p role="alert" className="error">
        This build is missing {missing.join(' and ')}. Set {missing.length === 1 ? 'it' : 'them'} in
        packages/web/.env.local and restart. See packages/web/README.md.
      </p>
    </main>
  );
}
