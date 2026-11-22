/** Spec §7, "Visual design". Every colour in the app comes from here. */
export const tokens = {
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
} as const;

/** Category colours, in the order the spec gives them. */
export const categoryColors = [
  '#0F6E74',
  '#00929C',
  '#A87A00',
  '#6B57C9',
  '#2F5F62',
  '#C2417F',
  '#9C5B3B',
  '#C9610E',
  '#8A7D70',
] as const;

const kebab = (name: string) => name.replace(/[A-Z0-9]/g, (c) => `-${c.toLowerCase()}`);

/** The tokens as CSS custom properties, for a `:root { … }` block. */
export function tokensToCss(): string {
  const lines = Object.entries(tokens).map(([name, hex]) => `--color-${kebab(name)}: ${hex};`);
  categoryColors.forEach((hex, i) => lines.push(`--color-category-${i + 1}: ${hex};`));
  return lines.join('\n');
}
