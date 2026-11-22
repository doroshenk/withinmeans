/** Splits a SQL script into its top-level statements (comments, quotes and $$ bodies respected). */
export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let start = 0;
  let i = 0;
  const push = (end: number): void => {
    const text = sql.slice(start, end).trim();
    if (text !== '') statements.push(text);
  };
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
      i = j + 1;
    } else if (dollar) {
      const end = sql.indexOf(dollar[0], i + dollar[0].length);
      i = end === -1 ? sql.length : end + dollar[0].length;
    } else if (sql[i] === ';') {
      push(i);
      start = i + 1;
      i += 1;
    } else {
      i += 1;
    }
  }
  push(sql.length);
  return statements;
}
