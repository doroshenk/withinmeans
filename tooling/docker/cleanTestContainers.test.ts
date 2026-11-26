import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { cleanTestContainers } from './cleanTestContainers';

interface Proc {
  pid: number;
  ppid: number;
  command: string;
}

const SELF = 300;

/** This run: a shell whose command mentions vitest, then the cleanup step itself. */
const ownTree: Proc[] = [
  { pid: 100, ppid: 1, command: 'node /usr/lib/pnpm.cjs test' },
  { pid: 200, ppid: 100, command: 'sh -c "node cleanTestContainers.ts && node vitest.mjs run"' },
  { pid: SELF, ppid: 200, command: 'node tooling/docker/cleanTestContainers.ts' },
];

/** A fake machine: its processes, and the test containers Docker lists. */
function machine(options: {
  containers?: string[];
  others?: Proc[];
  platform?: NodeJS.Platform;
  fail?: 'docker' | 'processes' | 'remove';
}) {
  const platform = options.platform ?? 'linux';
  const processes = [...ownTree, ...(options.others ?? [])];
  const calls: string[][] = [];
  const run = (command: string, args: string[]): string => {
    calls.push([command, ...args]);
    if (command === 'docker' && args[0] === 'ps') {
      if (options.fail === 'docker') throw new Error('Docker is not running');
      return (options.containers ?? ['aaa', 'bbb']).map((id) => `${id}\n`).join('');
    }
    if (command === 'docker') {
      if (options.fail === 'remove') throw new Error('no such container');
      return '';
    }
    if (options.fail === 'processes') throw new Error('cannot list processes');
    if (command === 'ps')
      return processes.map((p) => `  ${p.pid}  ${p.ppid} ${p.command}`).join('\n');
    return JSON.stringify(
      processes.map((p) => ({ ProcessId: p.pid, ParentProcessId: p.ppid, CommandLine: p.command })),
    );
  };
  const message = cleanTestContainers({ run, platform, selfPid: SELF });
  const removals = calls.filter((c) => c[0] === 'docker' && c[1] === 'rm');
  return { message, removals, calls };
}

describe('leftover test container cleanup', () => {
  it.each(['linux', 'win32'] as const)(
    'removes the leftover containers when no other test run is active (%s)',
    (platform) => {
      const { message, removals } = machine({ platform });

      expect(removals).toEqual([['docker', 'rm', '-f', '-v', 'aaa', 'bbb']]);
      expect(message).toBe('Removed 2 leftover test containers.');
    },
  );

  it('only looks for Postgres containers that Testcontainers started, running or not', () => {
    const { calls } = machine({});

    expect(calls[0]).toEqual([
      'docker',
      'ps',
      '--all',
      '--quiet',
      '--filter',
      'label=org.testcontainers=true',
      '--filter',
      'ancestor=postgres:16-alpine',
    ]);
  });

  it.each([
    String.raw`node "C:\dev\other\node_modules\.bin\..\vitest\vitest.mjs" run`,
    String.raw`node.exe C:\dev\other\node_modules\vitest\dist\workers\forks.js`,
    'node /repo/node_modules/.pnpm/vitest@5/node_modules/vitest/dist/workers/forks.js',
    'node (vitest 2)',
    'node /repo/node_modules/@stryker-mutator/core/bin/stryker.js run',
  ])('removes nothing while another run is active: %s', (command) => {
    const { message, removals } = machine({ others: [{ pid: 900, ppid: 1, command }] });

    expect(removals).toEqual([]);
    expect(message).toBe('Another test run is active, so no test containers were removed.');
  });

  it('is not put off by unrelated processes, or ones with no command line', () => {
    const others = [
      { pid: 900, ppid: 1, command: 'node /repo/node_modules/vite/bin/vite.js' },
      { pid: 901, ppid: 1, command: 'grep vitest notes.txt' },
      { pid: 902, ppid: 1, command: '' },
    ];

    expect(machine({ others, platform: 'win32' }).removals).toHaveLength(1);
  });

  it('lists the containers before checking for runs, so a new run keeps its containers', () => {
    const { calls } = machine({});

    expect(calls.map((c) => c.slice(0, 2).join(' '))).toEqual(['docker ps', 'ps -eo', 'docker rm']);
  });

  it('does nothing more when there are no leftovers', () => {
    const { message, calls } = machine({ containers: [] });

    expect(calls).toHaveLength(1);
    expect(message).toBe('No leftover test containers.');
  });

  it.each(['docker', 'processes', 'remove'] as const)(
    'warns instead of failing the tests when %s fails',
    (fail) => {
      expect(machine({ fail }).message).toMatch(/^Skipped test container cleanup: /);
    },
  );

  it.each(['test', 'coverage'])('runs before pnpm %s', (script) => {
    const root = fileURLToPath(new URL('../..', import.meta.url));
    const { scripts } = JSON.parse(readFileSync(`${root}/package.json`, 'utf8')) as {
      scripts: Record<string, string>;
    };

    expect(scripts[script]).toMatch(/^node tooling\/docker\/cleanTestContainers\.ts && /);
  });
});
