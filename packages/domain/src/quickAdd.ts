export type QuickAddType = 'bill' | 'income' | 'paycheck' | 'card';

export interface QuickAddTypeInfo {
  id: QuickAddType;
  label: string;
  /** One line under the label in the list. */
  hint: string;
  heading: string;
  help: string;
}

export const QUICK_ADD_TYPES: readonly QuickAddTypeInfo[] = [];

export const QUICK_ADD_PAGES = {} as Record<
  QuickAddType,
  { route: 'bills' | 'paychecks'; name: string }
>;

const notImplemented = (): never => {
  throw new Error('not implemented');
};

export function quickAddLandedText(_type: QuickAddType, _name: string, _date: string): string {
  return notImplemented();
}

export function quickAddPreviewText(
  _type: QuickAddType,
  _date: string,
  _category?: string,
): string | null {
  return notImplemented();
}

export function quickAddDetail(_type: QuickAddType, _date: string): string {
  return notImplemented();
}
