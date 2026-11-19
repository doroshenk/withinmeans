export type Cents = number;

export function assertCents(_value: number, _label?: string): asserts _value is Cents {
  throw new Error('not implemented');
}
export function addCents(_a: Cents, _b: Cents): Cents {
  throw new Error('not implemented');
}
export function subCents(_a: Cents, _b: Cents): Cents {
  throw new Error('not implemented');
}
export function sumCents(_values: readonly Cents[]): Cents {
  throw new Error('not implemented');
}
export function formatMoney(_value: Cents, _options?: { whole?: boolean }): string {
  throw new Error('not implemented');
}
