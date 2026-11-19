import { describe, expect, it } from 'vitest';
import { add } from './placeholder';

describe('placeholder (proves the red→green loop works)', () => {
  it('adds two numbers', () => {
    expect(add(2, 3)).toBe(5);
  });
});
