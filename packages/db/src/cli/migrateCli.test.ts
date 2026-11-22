import { describe, expect, it, vi } from 'vitest';
import type { Database } from '../db.js';
import { runMigrateCli, type MigrateCliDeps } from './migrateCli.js';

function deps(overrides: Partial<MigrateCliDeps> = {}) {
  const destroy = vi.fn().mockResolvedValue(undefined);
  const db = { destroy } as unknown as Database;
  const d = {
    lookupEndpoint: vi.fn().mockResolvedValue('abc.dsql.us-east-2.on.aws'),
    connect: vi.fn().mockReturnValue(db),
    migrate: vi.fn().mockResolvedValue(['0001_core.sql']),
    log: vi.fn(),
    env: {},
    ...overrides,
  } satisfies MigrateCliDeps;
  return { d, destroy, db };
}

describe('P0-07: pnpm migrate --stage', () => {
  it('P0-07: --stage dev looks up DataStack-dev, migrates, and closes the connection', async () => {
    const { d, destroy, db } = deps();
    await runMigrateCli(['--stage', 'dev'], d);
    expect(d.lookupEndpoint).toHaveBeenCalledWith('DataStack-dev');
    expect(d.connect).toHaveBeenCalledWith('abc.dsql.us-east-2.on.aws');
    expect(d.migrate).toHaveBeenCalledWith(db);
    expect(destroy).toHaveBeenCalledOnce();
    expect(d.log).toHaveBeenCalledWith(expect.stringContaining('0001_core.sql'));
  });

  it('P0-07: says so when there is nothing to apply', async () => {
    const { d } = deps({ migrate: vi.fn().mockResolvedValue([]) });
    await runMigrateCli(['--stage', 'dev'], d);
    expect(d.log).toHaveBeenCalledWith(expect.stringMatching(/up to date/i));
  });

  it('P0-07: closes the connection even when a migration fails', async () => {
    const { d, destroy } = deps({ migrate: vi.fn().mockRejectedValue(new Error('boom')) });
    await expect(runMigrateCli(['--stage', 'dev'], d)).rejects.toThrow('boom');
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('P0-07: requires --stage', async () => {
    const { d } = deps();
    await expect(runMigrateCli([], d)).rejects.toThrow(/--stage/);
    expect(d.connect).not.toHaveBeenCalled();
  });

  it('P0-07: refuses prod from a laptop (prod migrates only from the tag workflow)', async () => {
    const { d } = deps();
    await expect(runMigrateCli(['--stage', 'prod'], d)).rejects.toThrow(/prod/);
    expect(d.lookupEndpoint).not.toHaveBeenCalled();
  });

  it('P0-07: rejects an unknown stage', async () => {
    const { d } = deps();
    await expect(runMigrateCli(['--stage', 'staging'], d)).rejects.toThrow(/stage/);
  });
});

describe('P0-13: pnpm migrate --stage prod from the tag workflow', () => {
  const tagRun = { GITHUB_ACTIONS: 'true', GITHUB_REF: 'refs/tags/v0.0.1' };

  it('P0-13: migrates prod when run by GitHub Actions on a v* tag', async () => {
    const { d } = deps({ env: tagRun });
    await runMigrateCli(['--stage', 'prod'], d);
    expect(d.lookupEndpoint).toHaveBeenCalledWith('DataStack-prod');
    expect(d.migrate).toHaveBeenCalledOnce();
  });

  it.each([
    ['a laptop', {}],
    ['GitHub Actions on main', { GITHUB_ACTIONS: 'true', GITHUB_REF: 'refs/heads/main' }],
    ['a pull request', { GITHUB_ACTIONS: 'true', GITHUB_REF: 'refs/pull/5/merge' }],
    ['a non-version tag', { GITHUB_ACTIONS: 'true', GITHUB_REF: 'refs/tags/test' }],
    ['a laptop faking only the ref', { GITHUB_REF: 'refs/tags/v1.0.0' }],
  ])('P0-13: still refuses prod from %s', async (_name, env) => {
    const { d } = deps({ env });
    await expect(runMigrateCli(['--stage', 'prod'], d)).rejects.toThrow(/prod/);
    expect(d.lookupEndpoint).not.toHaveBeenCalled();
  });
});
