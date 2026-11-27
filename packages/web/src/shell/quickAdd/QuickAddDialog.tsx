import {
  formatMoney,
  QUICK_ADD_PAGES,
  QUICK_ADD_TYPES,
  quickAddDetail,
  quickAddLandedText,
  type QuickAddType,
} from '@withinmeans/domain';
import { useEffect, useId, useRef, useState } from 'react';
import { apiErrorMessage } from '../../auth/errors';
import type { QuickAdd } from './context';
import { BillPanel, CardPanel, IncomePanel, PaycheckPanel, type NewEntry } from './panels';

const PANELS = {
  bill: BillPanel,
  income: IncomePanel,
  paycheck: PaycheckPanel,
  card: CardPanel,
} as const;

interface Added {
  key: number;
  type: QuickAddType;
  name: string;
  amountCents: number;
  date: string;
  undo: (() => Promise<unknown>) | undefined;
}

/** The letters design/QuickAdd.png puts beside the types. */
const BADGES: Record<QuickAddType, string> = { bill: 'B', income: 'I', paycheck: 'P', card: 'C' };

const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled])';

/** Escape closes, Tab stays inside, and closing returns to whatever opened it. */
function useModal(onClose: () => void) {
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    const opener = document.activeElement;
    dialog.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current();
      if (event.key !== 'Tab' || dialog.current === null) return;
      const inside = [...dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      const first = inside[0];
      const last = inside.at(-1);
      const at = document.activeElement;
      const leaving = !dialog.current.contains(at) || at === (event.shiftKey ? first : last);
      if (!leaving) return;
      event.preventDefault();
      (event.shiftKey ? last : first)?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);
  return dialog;
}

/** Spec §5.14, design/QuickAdd.png: add an entry from any page, with each page's own form. */
export function QuickAddDialog({ quickAdd, onClose }: { quickAdd: QuickAdd; onClose: () => void }) {
  const id = useId();
  const dialog = useModal(onClose);
  const [type, setType] = useState<QuickAddType>('bill');
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [added, setAdded] = useState<Added[]>([]);
  const [undoProblem, setUndoProblem] = useState<string | null>(null);
  const keys = useRef(0);
  const confirmation = useRef<HTMLParagraphElement>(null);
  // The form that was saved may be gone, or scrolled far from the confirmation.
  useEffect(() => {
    if (status !== null) confirmation.current?.focus();
  }, [status]);
  const info = QUICK_ADD_TYPES.find((t) => t.id === type);
  const Panel = PANELS[type];

  /** Runs one change; says what went wrong through `failed`. */
  const run = async <T,>(
    change: () => Promise<T>,
    failed: (message: string) => void,
    done: (result: T) => void,
  ): Promise<boolean> => {
    if (saving) return false;
    setSaving(true);
    setProblem(null);
    setUndoProblem(null);
    setStatus(null);
    try {
      done(await change());
      quickAdd.noteSaved();
      return true;
    } catch (error) {
      failed(apiErrorMessage(error));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const save = ({ save: change, undo, ...entry }: NewEntry) =>
    run(change, setProblem, (saved) => {
      setStatus(quickAddLandedText(entry.type, entry.name, entry.date));
      const key = ++keys.current;
      setAdded((list) => [{ ...entry, key, undo: undo?.(saved) }, ...list]);
    });

  const go = (route: 'bills' | 'paychecks' | 'recurring', ym?: string) => {
    onClose();
    quickAdd.onView(route, ym);
  };

  return (
    <div className="qa-backdrop">
      <div
        ref={dialog}
        className="qa-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
      >
        <div className="qa-head">
          <div>
            <h2 id={`${id}-title`}>Add</h2>
            <p>Everything lands on the right page and week automatically.</p>
          </div>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <span aria-hidden="true">✕</span>
          </button>
        </div>
        <div className="qa-body">
          <div className="qa-types" role="group" aria-labelledby={`${id}-types`}>
            <p id={`${id}-types`} className="qa-types-title">
              What are you adding?
            </p>
            {QUICK_ADD_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                className="qa-type"
                aria-pressed={t.id === type}
                onClick={() => {
                  setProblem(null);
                  setStatus(null);
                  setType(t.id);
                }}
              >
                <span className={`qa-badge qa-badge-${t.id}`} aria-hidden="true">
                  {BADGES[t.id]}
                </span>
                <span>
                  <strong>{t.label}</strong>
                  <small>{t.hint}</small>
                </span>
              </button>
            ))}
          </div>
          <div className="qa-panel">
            <h3>{info?.heading}</h3>
            <p className="help">{info?.help}</p>
            {status !== null && (
              <p ref={confirmation} role="status" tabIndex={-1} className="notice">
                {status}
              </p>
            )}
            <Panel
              key={type}
              quickAdd={quickAdd}
              saving={saving}
              problem={problem}
              onProblem={setProblem}
              onSave={save}
              onClose={onClose}
              onGo={(route) => go(route)}
            />
            {(added.length > 0 || undoProblem !== null) && (
              <section className="qa-added" aria-labelledby={`${id}-added`}>
                <h4 id={`${id}-added`}>Just added</h4>
                {undoProblem !== null && (
                  <p role="alert" className="error">
                    {undoProblem}
                  </p>
                )}
                <ul>
                  {added.map((entry) => (
                    <li key={entry.key} aria-label={entry.name}>
                      <div>
                        <strong>{entry.name}</strong>
                        <span>{quickAddDetail(entry.type, entry.date)}</span>
                      </div>
                      <strong>{formatMoney(entry.amountCents)}</strong>
                      <button
                        type="button"
                        className="link-button"
                        aria-label={`View ${entry.name}`}
                        onClick={() =>
                          go(QUICK_ADD_PAGES[entry.type].route, entry.date.slice(0, 7))
                        }
                      >
                        View
                      </button>
                      {entry.undo && (
                        <button
                          type="button"
                          className="link-button"
                          aria-label={`Undo ${entry.name}`}
                          disabled={saving}
                          onClick={() => {
                            const { undo } = entry;
                            if (!undo) return;
                            void run(undo, setUndoProblem, () => {
                              setAdded((list) => list.filter((e) => e.key !== entry.key));
                              setStatus(`Removed ${entry.name}.`);
                            });
                          }}
                        >
                          Undo
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
