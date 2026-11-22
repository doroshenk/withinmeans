import { describe, expect, it } from 'vitest';
import { categoryColors, tokens, tokensToCss } from './tokens';

// Spec §7, "Visual design": every hex value, by the name the spec gives it.
const SPEC_COLORS: Record<string, string> = {
  bg: '#FBF6EE',
  surface: '#FFFDF8',
  sidebar: '#F3EADC',
  borderCard: '#EDE4D6',
  borderInput: '#E3D8C6',
  ink: '#2B2520',
  ink2: '#4A4038',
  muted: '#6E6258',
  primary: '#0F6E74',
  primarySoft: '#E3F1EF',
  income: '#00929C',
  expense: '#C9610E',
  options: '#6B57C9',
  weeklyDaily: '#A87A00',
  monthly: '#C2417F',
  savingsBucket: '#0F6E74',
  checkingBucket: '#8A7D70',
  warningBg: '#FFF8EC',
  warningBgStrong: '#FBEFD6',
  warningText: '#7A4F00',
  errorText: '#A63A12',
  okBg: '#E4F2E8',
  okText: '#1B6B42',
};

const SPEC_CATEGORY_COLORS = [
  '#0F6E74',
  '#00929C',
  '#A87A00',
  '#6B57C9',
  '#2F5F62',
  '#C2417F',
  '#9C5B3B',
  '#C9610E',
  '#8A7D70',
];

describe('design tokens (spec §7)', () => {
  it.each(Object.entries(SPEC_COLORS))('§7: %s is %s', (name, hex) => {
    expect(tokens).toHaveProperty(name, hex);
  });

  it('§7: category colors are the nine spec colors, in order', () => {
    expect(categoryColors).toEqual(SPEC_CATEGORY_COLORS);
  });

  it('§7: no token has a hex the spec does not list', () => {
    const allowed = new Set([...Object.values(SPEC_COLORS), ...SPEC_CATEGORY_COLORS]);
    const stray = Object.values(tokens).filter((v) => typeof v === 'string' && !allowed.has(v));
    expect(stray).toEqual([]);
  });

  it('exposes every token as a CSS custom property', () => {
    const css = tokensToCss();
    expect(css).toContain('--color-bg: #FBF6EE;');
    expect(css).toContain('--color-primary: #0F6E74;');
    expect(css).toContain('--color-border-input: #E3D8C6;');
    expect(css).toContain('--color-category-9: #8A7D70;');
    for (const hex of Object.values(SPEC_COLORS)) expect(css).toContain(hex);
  });
});
