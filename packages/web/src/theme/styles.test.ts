/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(import.meta.dirname, '../styles.css'), 'utf8');

describe('P2-07 styles', () => {
  // Setup's lists and the Bills weeks both have bill rows; an unscoped second rule restyles setup.
  it('styles the Bills weeks’ rows only inside the weeks', () => {
    expect(css.match(/^\.bill-row \{/gm)).toHaveLength(1);
    expect(css).toMatch(/^\.bill-rows \.bill-row \{/m);
  });
});
