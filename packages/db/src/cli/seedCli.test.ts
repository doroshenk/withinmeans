import { describe, expect, it, vi } from 'vitest';
import type { Database } from '../db.js';
import { runSeedCli, type SeedCliDeps } from './seedCli.js';

function deps(overrides: Partial<SeedCliDeps> = {}) {
  const destroy = vi.fn().mockResolvedValue(undefined);
  const db = { destroy } as unknown as Database;
  const d = {
    lookupEndpoint: vi.fn().mockResolvedValue('abc.dsql.us-east-2.on.aws'),
    connect: vi.fn().mockReturnValue(db),
    seed: vi.fn().mockResolvedValue({ householdId: 'h', ownerEmail: 'john@example.test' }),
    log: vi.fn(),
    now: () => new Date('2026-11-18T12:00:00Z'),
    ...overrides,
  } satisfies SeedCliDeps;
  return { d, destroy, db };
}

describe('P2-11: pnpm seed:dev', () => {
  it('seeds the dev cluster and closes the connection', async () => {
    const { d, destroy, db } = deps();

    await runSeedCli(['--stage', 'dev'], d);

    expect(d.lookupEndpoint).toHaveBeenCalledWith('DataStack-dev');
    expect(d.connect).toHaveBeenCalledWith('abc.dsql.us-east-2.on.aws');
    expect(d.seed).toHaveBeenCalledWith(db, { now: new Date('2026-11-18T12:00:00Z') });
    expect(destroy).toHaveBeenCalledOnce();
    expect(d.log).toHaveBeenCalledWith(expect.stringContaining('Our household'));
  });

  it.each([
    ['--stage', 'prod'],
    ['--stage', 'staging'],
    ['--stage', 'DEV'],
    ['--stage'],
    [],
    // `pnpm seed:dev --stage prod` arrives with both.
    ['--stage', 'dev', '--stage', 'prod'],
    ['--stage', 'prod', '--stage', 'dev'],
  ])('Seed refuses with a non-dev stage: %s %s %s %s', async (...argv) => {
    const { d } = deps();
    const given = argv.filter((a) => typeof a === 'string');

    await expect(runSeedCli(given, d)).rejects.toThrow(/dev/);

    expect(d.lookupEndpoint).not.toHaveBeenCalled();
    expect(d.connect).not.toHaveBeenCalled();
    expect(d.seed).not.toHaveBeenCalled();
  });

  it('passes the options on', async () => {
    const { d } = deps();

    await runSeedCli(
      ['--stage', 'dev', '--', '--reset', '--owner-email', 'me@example.test', '--leave-household'],
      d,
    );

    expect(d.seed).toHaveBeenCalledWith(expect.anything(), {
      now: new Date('2026-11-18T12:00:00Z'),
      reset: true,
      ownerEmail: 'me@example.test',
      leaveHousehold: true,
    });
  });

  it.each([
    [['--resett']],
    [['--owner-email']],
    [['--owner-email', '--reset']],
    [['me@example.test']],
  ])('rejects %j without touching dev', async (extra) => {
    const { d } = deps();

    await expect(runSeedCli(['--stage', 'dev', ...extra], d)).rejects.toThrow(/Usage/);

    expect(d.connect).not.toHaveBeenCalled();
  });

  it('closes the connection when seeding fails', async () => {
    const { d, destroy } = deps({ seed: vi.fn().mockRejectedValue(new Error('boom')) });

    await expect(runSeedCli(['--stage', 'dev'], d)).rejects.toThrow('boom');

    expect(destroy).toHaveBeenCalledOnce();
  });

  it('says that the made-up owner cannot sign in', async () => {
    const { d } = deps();

    await runSeedCli(['--stage', 'dev'], d);

    expect(d.log).toHaveBeenCalledWith(expect.stringContaining('--owner-email'));
  });

  it('does not repeat a real email address in its output', async () => {
    const { d } = deps({
      seed: vi.fn().mockResolvedValue({ householdId: 'h', ownerEmail: 'me@real.test' }),
    });

    await runSeedCli(['--stage', 'dev', '--owner-email', 'me@real.test'], d);

    expect(JSON.stringify(d.log.mock.calls)).not.toContain('me@real.test');
  });
});
