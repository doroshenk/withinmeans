import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const apiSrc = fileURLToPath(new URL('../../packages/api/src', import.meta.url));

describe('P1-14: listContexts is for the nightly export job only', () => {
  it('no other API code builds household contexts without a signed-in member', () => {
    const callers = readdirSync(apiSrc, { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.ts'))
      .filter((file) => readFileSync(`${apiSrc}/${file}`, 'utf8').includes('listContexts'));

    expect(callers).toEqual(['exportJob.ts']);
  });
});
