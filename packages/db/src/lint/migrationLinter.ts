export interface Violation {
  rule: string;
  message: string;
}

/** Checks one migration file against what Aurora DSQL supports (CLAUDE.md, Data rules). */
export function lintMigration(_sql: string): Violation[] {
  throw new Error('not implemented');
}
