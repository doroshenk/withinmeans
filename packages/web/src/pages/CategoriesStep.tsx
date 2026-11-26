import { SUGGESTED_CATEGORIES, categoryNameError, nextColorIndex } from '@withinmeans/domain';
import { useCallback, useEffect, useState } from 'react';
import { GENERIC_ERROR, apiErrorMessage } from '../auth/errors';
import { useCan } from '../permissions';

export interface CategoryRow {
  id: string;
  name: string;
  colorIndex: number;
  billCount: number;
}

export interface DeleteResult {
  movedCount: number;
  movedToName: string;
  message: string | null;
}

export interface CategoriesClient {
  categories: { query: () => Promise<CategoryRow[]> };
  seedDefaultCategories: { mutate: (input: { preset: 'default' }) => Promise<unknown> };
  createCategory: {
    mutate: (input: { name: string; colorIndex: number }) => Promise<{ id: string }>;
  };
  renameCategory: { mutate: (input: { id: string; name: string }) => Promise<unknown> };
  recolorCategory: { mutate: (input: { id: string; colorIndex: number }) => Promise<unknown> };
  deleteCategory: {
    mutate: (input: { id: string; moveToId?: string }) => Promise<DeleteResult>;
  };
}

type Load = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; rows: CategoryRow[] };

const countText = (n: number): string =>
  n === 0 ? 'Not used yet' : `${n} ${n === 1 ? 'bill' : 'bills'}`;

/** Spec §3 step 4: bill categories (add, rename, recolor, delete with move). */
export function CategoriesStep({ client }: { client: CategoriesClient }) {
  const can = useCan();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const rows = await client.categories.query();
    setLoad({ kind: 'ready', rows });
    setDrafts({});
  }, [client]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        let rows = await client.categories.query();
        if (rows.length === 0 && can.write) {
          await client.seedDefaultCategories.mutate({ preset: 'default' });
          rows = await client.categories.query();
        }
        if (!cancelled) setLoad({ kind: 'ready', rows });
      } catch {
        if (!cancelled) setLoad({ kind: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, can.write]);

  if (load.kind === 'loading') return <p role="status">Loading…</p>;
  if (load.kind === 'error') return <p role="alert">{GENERIC_ERROR}</p>;
  const { rows } = load;

  /** Runs one change, then shows what the server now has. */
  const act = async (change: () => Promise<void>) => {
    setProblem(null);
    setNotice(null);
    try {
      await change();
      await reload();
    } catch (error) {
      setProblem(apiErrorMessage(error));
    }
  };

  const add = async (name: string): Promise<boolean> => {
    const error = categoryNameError(
      name,
      rows.map((r) => r.name),
    );
    if (error !== undefined) {
      setProblem(error);
      return false;
    }
    const colorIndex = nextColorIndex(rows.at(-1)?.colorIndex ?? -1);
    await act(async () => {
      await client.createCategory.mutate({ name: name.trim(), colorIndex });
    });
    return true;
  };

  const rename = async (row: CategoryRow) => {
    const draft = drafts[row.id];
    if (draft === undefined || draft === row.name) return;
    const error = categoryNameError(
      draft,
      rows.filter((r) => r.id !== row.id).map((r) => r.name),
    );
    if (error !== undefined) {
      setProblem(error);
      setDrafts(({ [row.id]: _discarded, ...rest }) => rest);
      return;
    }
    await act(async () => {
      await client.renameCategory.mutate({ id: row.id, name: draft.trim() });
    });
  };

  const taken = new Set(rows.map((r) => r.name.toLowerCase()));
  const suggestions = SUGGESTED_CATEGORIES.filter((s) => !taken.has(s.toLowerCase()));

  return (
    <div className="categories">
      <ul className="category-list" aria-label="Categories">
        {rows.map((row) => (
          <li key={row.id} className="category-row">
            {can.write ? (
              <button
                type="button"
                className="category-swatch"
                style={{ background: `var(--color-category-${row.colorIndex + 1})` }}
                aria-label={`Change color of ${row.name}`}
                onClick={() =>
                  void act(async () => {
                    await client.recolorCategory.mutate({
                      id: row.id,
                      colorIndex: nextColorIndex(row.colorIndex),
                    });
                  })
                }
              />
            ) : (
              <span
                className="category-swatch"
                style={{ background: `var(--color-category-${row.colorIndex + 1})` }}
                aria-hidden="true"
              />
            )}
            <input
              className="category-name"
              type="text"
              aria-label={`Name of ${row.name}`}
              value={drafts[row.id] ?? row.name}
              readOnly={!can.write}
              onChange={(e) => setDrafts({ ...drafts, [row.id]: e.target.value })}
              onBlur={() => void rename(row)}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
            <span className="category-count">{countText(row.billCount)}</span>
            {can.write && (
              <button
                type="button"
                className="category-delete"
                aria-label={`Delete ${row.name}`}
                disabled={rows.length === 1}
                onClick={() =>
                  void act(async () => {
                    const result = await client.deleteCategory.mutate({ id: row.id });
                    setNotice(result.message);
                  })
                }
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>

      {rows.length === 0 && !can.write && (
        <p>No categories yet. The owner or a full member will set them up.</p>
      )}

      {notice !== null && <p role="status">{notice}</p>}
      {problem !== null && <p role="alert">{problem}</p>}

      {can.write && (
        <>
          <form
            className="category-add"
            onSubmit={(e) => {
              e.preventDefault();
              void add(newName).then((ok) => ok && setNewName(''));
            }}
          >
            <label htmlFor="new-category">New category</label>
            <input
              id="new-category"
              type="text"
              placeholder="e.g. Pets"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button type="submit" className="button">
              Add category
            </button>
          </form>

          {suggestions.length > 0 && (
            <div className="category-suggestions">
              <span>Common ones:</span>
              {suggestions.map((name) => (
                <button
                  key={name}
                  type="button"
                  className="chip"
                  onClick={() => void add(name)}
                >{`+ ${name}`}</button>
              ))}
            </div>
          )}
        </>
      )}

      <p className="category-help">
        These same categories are used for recurring bills, one-time bills and the spending
        breakdowns. Tap a color square to change its color. You can change all of this later on the
        Recurring bills page.
      </p>
    </div>
  );
}
