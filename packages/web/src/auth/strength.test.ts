import { describe, expect, it } from 'vitest';
import { passwordStrength } from './strength';

describe('passwordStrength (4-step meter, spec §3)', () => {
  it.each([
    ['', 0],
    ['short', 1],
    ['abcdefg', 1],
    ['abcdefgh', 2],
    ['abcdefg1', 3],
    ['abcdefghijkl', 3],
    ['correct horse 42', 4],
  ])('%j scores %i', (password, score) => {
    expect(passwordStrength(password)).toBe(score);
  });
});
