import { describe, expect, it } from 'vitest';
import { splitStatements } from './sqlStatements.js';

describe('P0-07: splitStatements', () => {
  it('P0-07: splits on top-level semicolons and drops empty statements', () => {
    expect(splitStatements('CREATE TABLE a (id int);\n\nCREATE TABLE b (id int);\n')).toEqual([
      'CREATE TABLE a (id int)',
      'CREATE TABLE b (id int)',
    ]);
  });

  it('P0-07: keeps a final statement with no semicolon', () => {
    expect(splitStatements('SELECT 1; SELECT 2')).toEqual(['SELECT 1', 'SELECT 2']);
  });

  it('P0-07: ignores semicolons inside string literals, including doubled quotes', () => {
    expect(splitStatements("INSERT INTO t VALUES ('a;b', 'it''s; ok'); SELECT 1;")).toEqual([
      "INSERT INTO t VALUES ('a;b', 'it''s; ok')",
      'SELECT 1',
    ]);
  });

  it('P0-07: ignores semicolons inside comments', () => {
    expect(splitStatements('-- one; two\nSELECT 1; /* a; b */ SELECT 2;')).toEqual([
      '-- one; two\nSELECT 1',
      '/* a; b */ SELECT 2',
    ]);
  });

  it('P0-07: ignores semicolons inside dollar-quoted bodies', () => {
    const fn = 'CREATE FUNCTION f() RETURNS int LANGUAGE sql AS $body$ SELECT 1; SELECT 2; $body$';
    expect(splitStatements(`${fn}; SELECT 3;`)).toEqual([fn, 'SELECT 3']);
  });

  it('P0-07: returns nothing for an empty or comment-only script', () => {
    expect(splitStatements('')).toEqual([]);
    expect(splitStatements('  \n ;; ')).toEqual([]);
  });
});
