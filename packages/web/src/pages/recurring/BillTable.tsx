import {
  dueInText,
  formatMoney,
  formatShortDate,
  monthlyBillsTotal,
  ordinal,
  sortRecurring,
  type RecurringSort,
  type UpcomingBill,
} from '@withinmeans/domain';
import { useId, useState } from 'react';
import { useCan } from '../../permissions';
import type { CategoryRow } from '../CategoriesStep';

const SORTS: { value: RecurringSort; label: string }[] = [
  { value: 'next-due', label: 'Next due date' },
  { value: 'amount', label: 'Amount' },
  { value: 'name', label: 'Name' },
];

export interface BillTableProps {
  bills: UpcomingBill[];
  categories: CategoryRow[];
  onEdit: (bill: UpcomingBill) => void;
  onManageCategories: () => void;
}

/** "All recurring bills": filter by category, sort, and a total. Cards on a phone. */
export function BillTable({ bills, categories, onEdit, onManageCategories }: BillTableProps) {
  const can = useCan();
  const sortId = useId();
  const [filter, setFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<RecurringSort>('next-due');
  // A deleted category can no longer be the filter.
  const chosen = categories.some((c) => c.id === filter) ? filter : null;
  const shown = sortRecurring(
    bills.filter((b) => chosen === null || b.categoryId === chosen),
    sort,
  );
  const total = monthlyBillsTotal(shown.map((b) => b.estimateCents));
  const noun = shown.length === 1 ? 'bill' : 'bills';

  const filterButton = (id: string | null, label: string) => (
    <button
      key={id ?? 'all'}
      type="button"
      className="filter"
      aria-pressed={chosen === id}
      onClick={() => setFilter(id)}
    >
      {label}
    </button>
  );

  return (
    <section className="card">
      <h2 id={`${sortId}-title`}>All recurring bills</h2>
      <div className="filters">
        <div className="filters" role="group" aria-label="Filter by category">
          {filterButton(null, 'All')}
          {categories.map((c) => filterButton(c.id, c.name))}
        </div>
        <label htmlFor={sortId}>Sort</label>
        <select id={sortId} value={sort} onChange={(e) => setSort(e.target.value as RecurringSort)}>
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        {can.write && (
          <button type="button" className="button button-quiet" onClick={onManageCategories}>
            Manage categories
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <p>{chosen === null ? 'No active bills.' : 'No bills in this category.'}</p>
      ) : (
        <table className="recurring-table" aria-labelledby={`${sortId}-title`}>
          <thead>
            <tr>
              <th scope="col">Bill</th>
              <th scope="col">Category</th>
              <th scope="col" className="amount">
                Estimated
              </th>
              <th scope="col">Due each month</th>
              <th scope="col">Next projected due</th>
              <th scope="col">Paid by</th>
              {can.write && (
                <th scope="col">
                  <span className="visually-hidden">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {shown.map((bill) => {
              const category = categories.find((c) => c.id === bill.categoryId);
              const due = dueInText(bill.daysUntil);
              return (
                <tr key={bill.id}>
                  <th scope="row">{bill.name}</th>
                  <td data-label="Category">
                    {category && (
                      <span
                        className="category-chip"
                        style={{
                          borderColor: `var(--color-category-${category.colorIndex + 1})`,
                        }}
                      >
                        {category.name}
                      </span>
                    )}
                  </td>
                  <td data-label="Estimated" className="amount">
                    {formatMoney(bill.estimateCents)}
                  </td>
                  <td data-label="Due each month">{`The ${ordinal(bill.dueDay)}`}</td>
                  <td data-label="Next projected due">
                    {formatShortDate(bill.nextDue)}
                    <small className={due.soon ? 'due-soon' : 'due-later'}>{due.text}</small>
                  </td>
                  <td data-label="Paid by">{bill.autopay ? 'Autopay' : 'You pay'}</td>
                  {can.write && (
                    <td>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Edit ${bill.name}`}
                        onClick={() => onEdit(bill)}
                      >
                        <span aria-hidden="true">✎</span>
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <p className="recurring-footer" data-testid="bills-footer">
        <span>{chosen === null ? `All ${shown.length} ${noun}` : `${shown.length} ${noun}`}</span>
        <strong>{`${formatMoney(total)} / month`}</strong>
      </p>
    </section>
  );
}
