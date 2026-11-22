import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lintMigration } from './migrationLinter.js';

const rules = (sql: string) => lintMigration(sql).map((v) => v.rule);

describe('migration linter: rejects what DSQL cannot do', () => {
  it('rejects SERIAL', () => {
    expect(rules('CREATE TABLE t (id SERIAL PRIMARY KEY);')).toContain('no-serial');
  });
  it('rejects BIGSERIAL', () => {
    expect(rules('CREATE TABLE t (id bigserial PRIMARY KEY);')).toContain('no-serial');
  });
  it('rejects IDENTITY columns', () => {
    expect(rules('CREATE TABLE t (id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY);')).toContain(
      'no-identity',
    );
  });
  it('rejects CREATE SEQUENCE', () => {
    expect(rules('CREATE SEQUENCE s;')).toContain('no-sequence');
  });
  it('rejects CREATE TRIGGER', () => {
    expect(
      rules('CREATE TRIGGER x BEFORE INSERT ON t FOR EACH ROW EXECUTE FUNCTION f();'),
    ).toContain('no-trigger');
  });
  it('rejects non-SQL functions (plpgsql)', () => {
    expect(
      rules('CREATE FUNCTION f() RETURNS int AS $$ BEGIN RETURN 1; END $$ LANGUAGE plpgsql;'),
    ).toContain('no-non-sql-function');
  });
  it('rejects TRUNCATE', () => {
    expect(rules('TRUNCATE t;')).toContain('no-truncate');
  });
  it('rejects temp tables', () => {
    expect(rules('CREATE TEMP TABLE t (a int);')).toContain('no-temp-table');
    expect(rules('CREATE TEMPORARY TABLE t (a int);')).toContain('no-temp-table');
  });
  it('rejects a migration mixing DDL with DML', () => {
    expect(rules('CREATE TABLE t (a int); INSERT INTO t (a) VALUES (1);')).toContain(
      'no-mixed-ddl-dml',
    );
  });
});

describe('migration linter: avoids false positives', () => {
  it('accepts LANGUAGE sql functions', () => {
    expect(rules('CREATE FUNCTION f() RETURNS int AS $$ SELECT 1 $$ LANGUAGE sql;')).toEqual([]);
  });
  it('ignores banned words in comments and string literals', () => {
    const sql = "-- no SERIAL here\nCREATE TABLE t (note text DEFAULT 'TRUNCATE me');";
    expect(rules(sql)).toEqual([]);
  });
  it('accepts a DML-only migration', () => {
    expect(rules('INSERT INTO t (a) VALUES (1); UPDATE t SET a = 2;')).toEqual([]);
  });
});

describe('migration linter: parsing edge cases', () => {
  it('handles escaped quotes, block comments and tagged dollar quotes', () => {
    const sql =
      "/* TRUNCATE */ CREATE TABLE t (a text DEFAULT 'it''s SERIAL');\nCREATE FUNCTION f() RETURNS int AS $body$ TRUNCATE x; $body$ LANGUAGE sql;";
    expect(rules(sql)).toEqual([]);
  });
  it('does not crash on unterminated comments, strings or dollar quotes', () => {
    expect(rules('CREATE TABLE t (a int); /* open')).toEqual([]);
    expect(rules('CREATE TABLE t (a int); -- trailing')).toEqual([]);
    expect(rules("CREATE TABLE t (a text DEFAULT 'open")).toEqual([]);
    expect(rules('CREATE TABLE t (a int); SELECT $$ open')).toEqual([]);
  });
  it('rejects a function with no LANGUAGE clause', () => {
    expect(rules('CREATE FUNCTION f() RETURNS int AS $$ SELECT 1 $$;')).toContain(
      'no-non-sql-function',
    );
  });
  it('reports each rule once', () => {
    expect(rules('CREATE SEQUENCE a; CREATE SEQUENCE b;')).toEqual(['no-sequence']);
  });
});

describe('migration linter: real migrations', () => {
  it('every migration in packages/db/migrations passes', () => {
    const dir = new URL('../../migrations/', import.meta.url);
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql'))) {
      expect(lintMigration(readFileSync(new URL(f, dir), 'utf8')), f).toEqual([]);
    }
  });
  it('accepts the first real migration', () => {
    const sql = readFileSync(new URL('../../migrations/0001_core.sql', import.meta.url), 'utf8');
    expect(lintMigration(sql)).toEqual([]);
  });
});
