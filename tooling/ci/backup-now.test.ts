import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const slashes = (path: string): string => path.replaceAll('\\', '/');

/** On Windows a bare `bash` can be WSL's, so take the one that ships with Git. */
function findBash(): string {
  if (process.platform !== 'win32') return 'bash';
  const execPath = execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim();
  return resolve(execPath, '../../../bin/bash.exe');
}

/**
 * Shell functions that stand in for the AWS CLI and `sleep`. Bash sources this file (BASH_ENV)
 * before the script, and a function wins over any program on PATH.
 */
const STUB = `
aws() {
  printf '%s %s\\n' "$1" "$2" >>"$STUB_LOG"
  case "$1 $2" in
    "cloudformation describe-stacks") echo "$STUB_OUTPUT" ;;
    "backup start-backup-job")
      [ -z "\${STUB_START_FAILS:-}" ] || return 254
      echo job-1
      ;;
    "backup describe-backup-job")
      [ -z "\${STUB_DESCRIBE_FAILS:-}" ] || return 254
      # The nth call answers with the nth state; the last state repeats.
      local calls=0 line states
      while read -r line; do
        [ "$line" != "backup describe-backup-job" ] || calls=$((calls + 1))
      done <"$STUB_LOG"
      read -r -a states <<<"$STUB_STATES"
      [ "$calls" -le "\${#states[@]}" ] || calls="\${#states[@]}"
      echo "\${states[$((calls - 1))]}"
      ;;
    *) echo "unexpected aws call" >&2; return 99 ;;
  esac
}
sleep() { :; }
`;

interface Stub {
  states?: string;
  output?: string;
  startFails?: boolean;
  describeFails?: boolean;
}

const made: string[] = [];
afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Runs the real scripts/backup-now.sh for prod against the stub. */
function backup(stub: Stub = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'backup-now-'));
  made.push(dir);
  const log = join(dir, 'calls.log');
  const env = join(dir, 'stub.sh');
  writeFileSync(log, '');
  writeFileSync(env, STUB);
  const run = spawnSync(findBash(), ['scripts/backup-now.sh', 'prod'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 110_000,
    env: {
      ...process.env,
      BASH_ENV: slashes(env),
      STUB_LOG: slashes(log),
      STUB_OUTPUT: stub.output ?? 'stub-value',
      STUB_STATES: stub.states ?? 'COMPLETED',
      STUB_START_FAILS: stub.startFails ? '1' : '',
      STUB_DESCRIBE_FAILS: stub.describeFails ? '1' : '',
      // Should the stub ever fail to load, the real CLI must find no credentials.
      AWS_PROFILE: 'backup-now-test-no-such-profile',
      AWS_CONFIG_FILE: slashes(join(dir, 'no-config')),
      AWS_SHARED_CREDENTIALS_FILE: slashes(join(dir, 'no-credentials')),
      AWS_ACCESS_KEY_ID: '',
      AWS_SECRET_ACCESS_KEY: '',
      AWS_SESSION_TOKEN: '',
      AWS_EC2_METADATA_DISABLED: 'true',
    },
  });
  const calls = readFileSync(log, 'utf8').split('\n').filter(Boolean);
  return {
    status: run.status,
    stderr: run.stderr,
    polls: calls.filter((c) => c === 'backup describe-backup-job').length,
    started: calls.includes('backup start-backup-job'),
  };
}

describe('P2-12: scripts/backup-now.sh', () => {
  it('P2-12: succeeds only once the backup job is COMPLETED', () => {
    const run = backup({ states: 'CREATED PENDING RUNNING COMPLETED' });

    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
    expect(run.polls).toBe(4);
  });

  it.each(['FAILED', 'ABORTED', 'EXPIRED', 'PARTIAL'])(
    'P2-12: Prod pipeline fails if the pre-migration backup job fails (%s)',
    (state) => {
      const run = backup({ states: `RUNNING ${state} COMPLETED` });

      expect(run.status).toBe(1);
      // At once: a finished job never changes, so there is nothing to wait for.
      expect(run.polls).toBe(2);
      expect(run.stderr).toContain(`Backup job ended as ${state}`);
    },
  );

  it('P2-12: Prod pipeline fails if the pre-migration backup job fails (never finishes)', () => {
    const run = backup({ states: 'RUNNING' });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain('Gave up waiting');
  }, 120_000);

  it('P2-12: Prod pipeline fails if the pre-migration backup job fails (cannot start)', () => {
    const run = backup({ startFails: true });

    expect(run.status).not.toBe(0);
    expect(run.polls).toBe(0);
  });

  it('P2-12: Prod pipeline fails if the pre-migration backup job fails (cannot be checked)', () => {
    const run = backup({ describeFails: true });

    expect(run.status).not.toBe(0);
  });

  it('P2-12: Prod pipeline fails if the pre-migration backup job fails (no stack output)', () => {
    const run = backup({ output: 'None' });

    expect(run.status).toBe(1);
    expect(run.started).toBe(false);
  });
});
