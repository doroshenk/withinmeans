export interface Violation {
  rule: string;
  message: string;
}

/**
 * Blanks out comments, string literals and dollar-quoted bodies so banned words
 * inside them never match. Keeps statement structure (semicolons, keywords).
 */
function stripNoise(sql: string): string {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const rest = sql.slice(i);
    const dollar = /^\$([A-Za-z_]\w*)?\$/.exec(rest);
    if (rest.startsWith('--')) {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end;
    } else if (rest.startsWith('/*')) {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
    } else if (rest.startsWith("'")) {
      let j = i + 1;
      while (j < sql.length && !(sql[j] === "'" && sql[j + 1] !== "'")) j += sql[j] === "'" ? 2 : 1;
      out += "''";
      i = j + 1;
    } else if (dollar) {
      const end = sql.indexOf(dollar[0], i + dollar[0].length);
      out += '$$';
      i = end === -1 ? sql.length : end + dollar[0].length;
    } else {
      out += sql[i];
      i += 1;
    }
  }
  return out;
}

const DDL = /^(CREATE|ALTER|DROP|COMMENT)\b/;
const DML = /^(INSERT|UPDATE|DELETE|MERGE|COPY)\b/;

/** Checks one migration file against what Aurora DSQL supports (CLAUDE.md, Data rules). */
export function lintMigration(sql: string): Violation[] {
  const found: Violation[] = [];
  const add = (rule: string, message: string) => {
    if (!found.some((v) => v.rule === rule)) found.push({ rule, message });
  };
  let hasDdl = false;
  let hasDml = false;

  const statements = stripNoise(sql)
    .split(';')
    .map((s) => s.replace(/\s+/g, ' ').trim().toUpperCase())
    .filter((s) => s !== '');

  for (const s of statements) {
    if (/\b(BIG|SMALL)?SERIAL\b/.test(s))
      add('no-serial', 'SERIAL types need sequences, which DSQL lacks');
    if (/\bAS IDENTITY\b/.test(s))
      add('no-identity', 'IDENTITY columns need sequences, which DSQL lacks');
    if (/^CREATE( TEMP(ORARY)?)? SEQUENCE\b/.test(s))
      add('no-sequence', 'DSQL has no sequences; use UUIDs');
    if (/^CREATE( OR REPLACE)?( CONSTRAINT)? TRIGGER\b/.test(s))
      add('no-trigger', 'DSQL has no triggers');
    if (/^CREATE( OR REPLACE)? (FUNCTION|PROCEDURE)\b/.test(s)) {
      const lang = /\bLANGUAGE (\w+)/.exec(s)?.[1];
      if (lang !== 'SQL') add('no-non-sql-function', 'DSQL supports only LANGUAGE sql functions');
    }
    if (/^TRUNCATE\b/.test(s)) add('no-truncate', 'DSQL has no TRUNCATE; use DELETE');
    if (/^CREATE( GLOBAL| LOCAL)? TEMP(ORARY)? TABLE\b/.test(s))
      add('no-temp-table', 'DSQL has no temporary tables');
    hasDdl ||= DDL.test(s);
    hasDml ||= DML.test(s);
  }
  if (hasDdl && hasDml) add('no-mixed-ddl-dml', 'A migration must be DDL-only or DML-only');
  return found;
}
