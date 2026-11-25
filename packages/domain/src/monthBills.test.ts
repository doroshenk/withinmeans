import { describe, expect, it } from 'vitest';
import { billsForMonth, type RecurringBillTemplate } from './monthBills';

const template = (over: Partial<RecurringBillTemplate> = {}): RecurringBillTemplate => ({
  id: 'r1',
  name: 'Electric',
  estimateCents: 12_050,
  dueDay: 5,
  categoryId: 'c1',
  startYm: '2026-11',
  endYm: null,
  ...over,
});

describe('P2-01 billsForMonth (spec §4 Bill, §5.11)', () => {
  it('makes one bill per active recurring bill, at its estimate and due date', () => {
    const rent = template({ id: 'r2', name: 'Rent', estimateCents: 150_000, dueDay: 28 });

    expect(billsForMonth([template(), rent], '2026-11')).toStrictEqual([
      {
        recurringBillId: 'r1',
        name: 'Electric',
        categoryId: 'c1',
        dueDate: '2026-11-05',
        estimateCents: 12_050,
      },
      {
        recurringBillId: 'r2',
        name: 'Rent',
        categoryId: 'c1',
        dueDate: '2026-11-28',
        estimateCents: 150_000,
      },
    ]);
  });

  it.each([
    ['starts after the month', { startYm: '2026-12' }],
    ['ended before the month', { startYm: '2026-01', endYm: '2026-10' }],
  ])('skips a recurring bill that %s', (_why, over) => {
    expect(billsForMonth([template(over)], '2026-11')).toEqual([]);
  });

  it.each([
    ['starts in the month', { startYm: '2026-11' }],
    ['ends in the month', { startYm: '2026-01', endYm: '2026-11' }],
    ['ends later, in another year', { startYm: '2025-12', endYm: '2027-01' }],
  ])('keeps a recurring bill that %s', (_why, over) => {
    expect(billsForMonth([template(over)], '2026-11')).toHaveLength(1);
  });

  it('makes nothing from no recurring bills', () => {
    expect(billsForMonth([], '2026-11')).toEqual([]);
  });

  it('rejects a malformed month', () => {
    expect(() => billsForMonth([template()], '2026-13')).toThrow(RangeError);
  });
});
