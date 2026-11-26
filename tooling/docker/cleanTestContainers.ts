/**
 * Removes Postgres containers that earlier test runs left behind, so they stop holding memory.
 * Testcontainers' own reaper waits until no run is connected, so with two clones testing back to
 * back, containers from timed-out runs pile up. Runs before `pnpm test` and `pnpm coverage`.
 *
 * Nothing is removed while any other Vitest or Stryker process is running on this machine.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Runs a program and returns what it printed. */
export type Run = (command: string, args: string[]) => string;

export interface CleanOptions {
  run: Run;
  platform: NodeJS.Platform;
  /** This process, so its own parents are not mistaken for another test run. */
  selfPid: number;
}

interface Proc {
  pid: number;
  ppid: number;
  command: string;
}

/** Only this repo's test databases: other Docker containers are never touched. */
const LIST_LEFTOVERS = [
  'ps',
  '--all',
  '--quiet',
  '--filter',
  'label=org.testcontainers=true',
  '--filter',
  'ancestor=postgres:16-alpine',
];

/** Vitest's entry script, its workers (some retitle themselves "node (vitest 1)") and Stryker. */
const TEST_RUN = /vitest\.mjs|[\\/]vitest[\\/]|\(vitest|stryker/i;

const lines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

function listProcesses({ run, platform }: CleanOptions): Proc[] {
  if (platform === 'win32') {
    const json = run('powershell.exe', [
      '-NoProfile',
      '-Command',
      'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress',
    ]);
    const rows = JSON.parse(json) as {
      ProcessId: number;
      ParentProcessId: number;
      CommandLine: string | null;
    }[];
    return rows.map((r) => ({
      pid: r.ProcessId,
      ppid: r.ParentProcessId,
      command: r.CommandLine ?? '',
    }));
  }
  return lines(run('ps', ['-eo', 'pid=,ppid=,args=', '-ww'])).map((line) => {
    const [pid, ppid, ...command] = line.split(/\s+/);
    return { pid: Number(pid), ppid: Number(ppid), command: command.join(' ') };
  });
}

/** True when a test run other than the one that started this script is active. */
function anotherRunIsActive(options: CleanOptions): boolean {
  const processes = listProcesses(options);
  const parents = new Map(processes.map((p) => [p.pid, p.ppid]));
  // This script and everything that started it: their command lines mention this run's vitest.
  const own = new Set<number>();
  for (let pid: number | undefined = options.selfPid; pid !== undefined && !own.has(pid);) {
    own.add(pid);
    pid = parents.get(pid);
  }
  return processes.some((p) => !own.has(p.pid) && TEST_RUN.test(p.command));
}

/** Returns what it did, to print. Never throws: cleanup must not stop the tests. */
export function cleanTestContainers(options: CleanOptions): string {
  try {
    // Listed before the check, so containers of a run that starts meanwhile are not in the list.
    const leftovers = lines(options.run('docker', LIST_LEFTOVERS));
    if (leftovers.length === 0) return 'No leftover test containers.';
    if (anotherRunIsActive(options)) {
      return 'Another test run is active, so no test containers were removed.';
    }
    options.run('docker', ['rm', '-f', '-v', ...leftovers]);
    return `Removed ${leftovers.length} leftover test containers.`;
  } catch (error) {
    return `Skipped test container cleanup: ${error instanceof Error ? error.message : String(error)}`;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const run: Run = (command, args) =>
    execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 120_000,
      maxBuffer: 64 * 1024 * 1024,
    });
  console.log(cleanTestContainers({ run, platform: process.platform, selfPid: process.pid }));
}
