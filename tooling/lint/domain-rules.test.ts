import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = fileURLToPath(new URL('../..', import.meta.url));
const eslint = new ESLint({ cwd: root });

async function messagesFor(pkg: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, {
    filePath: `${root}packages/${pkg}/src/sample.ts`,
  });
  return (result?.messages ?? []).map((m) => m.message);
}

describe('domain lint rule: no Date', () => {
  it.each([
    ['new Date()', 'export const x = new Date();'],
    ['Date.now()', 'export const x = Date.now();'],
    ['a Date type annotation', 'export function f(d: Date): void { void d; }'],
    ['Math.random()', 'export const x = Math.random();'],
  ])('forbids %s in packages/domain', async (_name, code) => {
    const messages = await messagesFor('domain', code);
    expect(messages.some((m) => /Date|clock|random/i.test(m))).toBe(true);
  });

  it('allows Date outside packages/domain', async () => {
    expect(await messagesFor('api', 'export const x = new Date();')).toEqual([]);
  });
});

describe('domain lint rule: no float math on *_cents identifiers', () => {
  it.each([
    ['division', 'export const f = (amount_cents: number) => amount_cents / 3;'],
    ['camelCase division', 'export const f = (amountCents: number) => amountCents / 3;'],
    ['a fractional multiplier', 'export const f = (amount_cents: number) => amount_cents * 0.5;'],
    ['Math.round', 'export const f = (amount_cents: number) => Math.round(amount_cents);'],
    ['Math.floor', 'export const f = (amountCents: number) => Math.floor(amountCents);'],
    ['toFixed', 'export const f = (amount_cents: number) => amount_cents.toFixed(2);'],
  ])('forbids %s on a cents identifier', async (_name, code) => {
    const messages = await messagesFor('domain', code);
    expect(messages.some((m) => /cents/i.test(m))).toBe(true);
  });

  it('allows integer math on cents identifiers', async () => {
    const code = `
      export const f = (a_cents: number, bCents: number) => a_cents + bCents - 1;
      export const g = (amountCents: number) => amountCents * 2;
      export const h = (amountCents: number) => amountCents % 100;
    `;
    expect(await messagesFor('domain', code)).toEqual([]);
  });

  it('allows division and Math.round on identifiers that are not cents', async () => {
    const code = 'export const f = (n: number) => Math.round(n / 3);';
    expect(await messagesFor('domain', code)).toEqual([]);
  });
});
