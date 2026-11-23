import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS_DIR } from '../migrate.js';
import { lintMigration } from './migrationLinter.js';

const dir = fileURLToPath(MIGRATIONS_DIR);
const files = readdirSync(dir).filter((f) => f.endsWith('.sql'));

describe('P1-01: migration linter passes on all migrations', () => {
  it('finds the migrations', () => {
    expect(files).toContain('0001_core.sql');
    expect(files).toContain('0002_core_tables.sql');
  });
  it.each(files)('%s has no DSQL violations', (file) => {
    expect(lintMigration(readFileSync(join(dir, file), 'utf8'))).toEqual([]);
  });
});
