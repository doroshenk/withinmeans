import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));

function read(path: string): string {
  const full = `${root}/${path}`;
  expect(existsSync(full), `${path} must exist`).toBe(true);
  return readFileSync(full, 'utf8');
}

describe('P2-12: docs/runbooks/release.md', () => {
  const text = (): string => read('docs/runbooks/release.md');

  it.each([
    ['how to tag a release', /git tag v0\.\d+\.\d+/],
    ['reading the prod diff first', /cdk diff --context stage=prod/],
    ['the backup before the migrations', /scripts\/backup-now\.sh prod/],
    ['what to do when the backup fails', /## If the backup fails/],
    ['what to do when a migration fails', /## If a migration fails/],
    ['forward-only migrations', /forward-only/i],
    ['two releases for a breaking change', /add → backfill → switch → drop/],
    ['where to restore from', /restore\.md/],
    ['the comparison sheet', /side-by-side\.csv/],
    ['the console', /## Find it in the console/],
  ])('covers %s', (_, pattern) => {
    expect(text()).toMatch(pattern);
  });

  it('says to choose the partner mode at sign-up, the only time a partner can be invited', () => {
    const first = text().split('## First release with real data')[1]?.split('\n## ')[0] ?? '';
    const signUp = read('packages/web/src/pages/SignUp.tsx');
    for (const label of ['Me and a partner', 'Just me', 'Send invite & finish']) {
      expect(signUp.replaceAll('&amp;', '&')).toContain(label);
      expect(first).toContain(label);
    }
    expect(first).not.toMatch(/Invite your partner, if you are two/);
  });

  it('restores from the backup of the first attempt, not one a re-run took', () => {
    expect(text()).toMatch(/first run of the release/);
  });

  it('is what CLAUDE.md sends a session to before a release', () => {
    expect(read('CLAUDE.md')).toContain('docs/runbooks/release.md');
  });
});

describe('P2-12: the side-by-side comparison sheet', () => {
  const rows = (): string[][] =>
    read('docs/runbooks/side-by-side.csv')
      .trim()
      .split('\n')
      .map((line) => line.split(','));

  it('has a column for the site, the Sheet, the difference and why', () => {
    expect(rows()[0]).toEqual([
      'Screen',
      'Figure',
      'Site',
      'Google Sheet',
      'Difference',
      'Explanation',
    ]);
  });

  it('is blank: the repo is public, so a filled-in copy is never committed', () => {
    for (const row of rows().slice(1)) {
      expect(row).toHaveLength(6);
      expect(row.slice(2)).toEqual(['', '', '', '']);
    }
  });

  it.each([
    ['Bills & cash flow', 'Paychecks & other income', 'pages/bills/BillTiles.tsx'],
    ['Bills & cash flow', 'Bills + cards this month', 'pages/bills/BillTiles.tsx'],
    ['Bills & cash flow', 'Paid so far', 'pages/bills/BillTiles.tsx'],
    ['Bills & cash flow', 'Left after bills', 'pages/bills/BillTiles.tsx'],
    ['Paychecks', 'Received so far', 'pages/paychecks/SummaryTiles.tsx'],
    ['Paychecks', 'Still expected', 'pages/paychecks/SummaryTiles.tsx'],
    ['Paychecks', 'Paychecks', 'pages/paychecks/SummaryTiles.tsx'],
    ['Paychecks', 'One-time income', 'pages/paychecks/SummaryTiles.tsx'],
  ])('compares %s: %s, under the name the screen uses', (screen, figure, file) => {
    expect(rows().some((r) => r[0] === screen && r[1] === figure)).toBe(true);
    // The tile's label in the source, with "&" possibly written as an HTML entity.
    const source = read(`packages/web/src/${file}`).replaceAll('&amp;', '&');
    expect(source).toContain(figure);
  });
});
