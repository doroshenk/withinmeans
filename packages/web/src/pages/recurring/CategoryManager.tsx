import {
  CATEGORY_COLORS,
  categoryNameError,
  categoryTotals,
  formatMoney,
  nextColorIndex,
  type RecurringBillItem,
} from '@withinmeans/domain';
import { useId, useState } from 'react';
import type { CategoryRow } from '../CategoriesStep';
import type { RecurringClient } from '../RecurringPage';

export interface CategoryManagerProps {
  client: RecurringClient;
  categories: CategoryRow[];
  bills: RecurringBillItem[];
  /** Categories any bill uses: deleting one asks where its bills move. */
  usedCategoryIds: string[];
  /** Runs a change, reloads, and reports a failure; resolves to whether it worked. */
  act: (change: () => Promise<unknown>) => Promise<boolean>;
  onProblem: (problem: string) => void;
  onDone: () => void;
}

function ColorPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (colorIndex: number) => void;
}) {
  const name = useId();
  return (
    <div className="color-picker" role="radiogroup" aria-label="Color">
      {CATEGORY_COLORS.map((color, index) => (
        <label key={color} className="color-choice">
          <input
            type="radio"
            name={name}
            aria-label={`Color ${index + 1}`}
            checked={value === index}
            onChange={() => onChange(index)}
          />
          <span style={{ background: `var(--color-category-${index + 1})` }} aria-hidden="true" />
        </label>
      ))}
    </div>
  );
}

type Open = { kind: 'edit' | 'delete'; id: string } | null;

/** Spec §6.3: add, rename, recolor and delete categories, with the in-use rules of §4. */
export function CategoryManager({
  client,
  categories,
  bills,
  usedCategoryIds,
  act,
  onProblem,
  onDone,
}: CategoryManagerProps) {
  const id = useId();
  const [open, setOpen] = useState<Open>(null);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<number | null>(null);
  const [draftName, setDraftName] = useState('');
  const [draftColor, setDraftColor] = useState(0);
  const [moveToId, setMoveToId] = useState('');
  const totals = categoryTotals(bills);
  const color = newColor ?? nextColorIndex(categories.at(-1)?.colorIndex ?? -1);

  const usage = (categoryId: string) => {
    const total = totals.get(categoryId);
    if (total === undefined) return 'No bills yet';
    const noun = total.count === 1 ? 'bill' : 'bills';
    return `${total.count} ${noun} · ${formatMoney(total.totalCents, { whole: true })} / month`;
  };

  const nameProblem = (name: string, exceptId?: string) =>
    categoryNameError(
      name,
      categories.filter((c) => c.id !== exceptId).map((c) => c.name),
    );

  const add = async () => {
    const error = nameProblem(newName);
    if (error !== undefined) return onProblem(error);
    const ok = await act(async () => {
      await client.createCategory.mutate({ name: newName.trim(), colorIndex: color });
    });
    if (ok) {
      setNewName('');
      setNewColor(null);
    }
  };

  const save = async (row: CategoryRow) => {
    const error = nameProblem(draftName, row.id);
    if (error !== undefined) return onProblem(error);
    const ok = await act(async () => {
      if (draftName.trim() !== row.name) {
        await client.renameCategory.mutate({ id: row.id, name: draftName.trim() });
      }
      if (draftColor !== row.colorIndex) {
        await client.recolorCategory.mutate({ id: row.id, colorIndex: draftColor });
      }
    });
    if (ok) setOpen(null);
  };

  const remove = async (row: CategoryRow, target: string) => {
    const ok = await act(async () => {
      const result = await client.deleteCategory.mutate({
        id: row.id,
        ...(target !== '' && { moveToId: target }),
      });
      return result.message;
    });
    if (ok) setOpen(null);
  };

  return (
    <section className="card category-manager" aria-label="Categories">
      <div className="card-head">
        <div>
          <h2>Categories</h2>
          <p className="help">
            Add, rename, recolor or remove the categories your bills are grouped by.
          </p>
        </div>
        <button type="button" className="button" onClick={onDone}>
          Done
        </button>
      </div>

      <ul className="category-cards">
        {categories.map((row) => {
          const used = row.billCount > 0 || usedCategoryIds.includes(row.id);
          return (
            <li key={row.id} className="category-card">
              <span
                className="category-chip"
                style={{ borderColor: `var(--color-category-${row.colorIndex + 1})` }}
              >
                {row.name}
              </span>
              <span className="category-usage">{usage(row.id)}</span>
              <button
                type="button"
                className="icon-button"
                aria-label={`Edit ${row.name}`}
                onClick={() => {
                  setDraftName(row.name);
                  setDraftColor(row.colorIndex);
                  setOpen({ kind: 'edit', id: row.id });
                }}
              >
                <span aria-hidden="true">✎</span>
              </button>
              <button
                type="button"
                className="icon-button icon-danger"
                aria-label={`Delete ${row.name}`}
                disabled={categories.length === 1}
                onClick={() => {
                  setMoveToId('');
                  setOpen({ kind: 'delete', id: row.id });
                }}
              >
                <span aria-hidden="true">✕</span>
              </button>

              {open?.id === row.id && open.kind === 'edit' && (
                <form
                  className="category-panel"
                  aria-label={`Edit ${row.name}`}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void save(row);
                  }}
                >
                  <div className="field">
                    <label htmlFor={`${id}-rename`}>Category name</label>
                    <input
                      id={`${id}-rename`}
                      type="text"
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                    />
                  </div>
                  <ColorPicker value={draftColor} onChange={setDraftColor} />
                  <button type="submit" className="button">
                    Save category
                  </button>
                  <button
                    type="button"
                    className="button button-quiet"
                    onClick={() => setOpen(null)}
                  >
                    Cancel
                  </button>
                </form>
              )}

              {open?.id === row.id && open.kind === 'delete' && (
                <div className="category-panel">
                  {used ? (
                    <div className="field">
                      <label htmlFor={`${id}-move`}>Move its bills to</label>
                      <select
                        id={`${id}-move`}
                        value={moveToId}
                        onChange={(e) => setMoveToId(e.target.value)}
                      >
                        <option value="" disabled>
                          Choose a category
                        </option>
                        {categories
                          .filter((c) => c.id !== row.id)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  ) : (
                    <p>Delete {row.name}? No bills use it.</p>
                  )}
                  <button
                    type="button"
                    className="button button-danger"
                    disabled={used && moveToId === ''}
                    onClick={() => void remove(row, used ? moveToId : '')}
                  >
                    Delete category
                  </button>
                  <button
                    type="button"
                    className="button button-quiet"
                    onClick={() => setOpen(null)}
                  >
                    Cancel
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <form
        className="category-new"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <div className="field">
          <label htmlFor={`${id}-new`}>New category</label>
          <input
            id={`${id}-new`}
            type="text"
            placeholder="e.g. Medical, Pets, Travel"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
        </div>
        <ColorPicker value={color} onChange={setNewColor} />
        <button type="submit" className="button">
          Add category
        </button>
      </form>
    </section>
  );
}
