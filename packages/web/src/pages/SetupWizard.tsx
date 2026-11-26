import {
  SETUP_STEPS,
  type FirstMonthChoice,
  type ReviewRow,
  markStep,
  resumeStep,
  reviewRows,
  setupAccountsError,
  setupPaychecksError,
  shownStatus,
  stepStatus,
  type SetupProgress,
} from '@withinmeans/domain';
import { useEffect, useState } from 'react';
import { GENERIC_ERROR } from '../auth/errors';
import { useCan } from '../permissions';
import { AccountsStep, type AccountsClient } from './AccountsStep';
import { CategoriesStep, type CategoriesClient } from './CategoriesStep';
import { PaychecksStep, type PaychecksClient } from './PaychecksStep';
import { RecurringBillsStep, type RecurringBillsClient } from './RecurringBillsStep';
import { WelcomeStep, type WelcomeClient } from './WelcomeStep';

export interface SetupClient
  extends AccountsClient, CategoriesClient, PaychecksClient, RecurringBillsClient, WelcomeClient {
  setupProgress: {
    query: () => Promise<{ step: number; status: 'done' | 'skipped' }[]>;
  };
  saveSetupStep: {
    mutate: (input: { step: number; status: 'done' | 'skipped' }) => Promise<unknown>;
  };
}

export interface SetupWizardProps {
  client: SetupClient;
  householdName: string;
  onExit: () => void;
}

type Load =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; progress: SetupProgress; current: number };

const LAST = SETUP_STEPS.length;

/** Steps with no screen yet. The ticket that builds a step removes it (P2-07, P3-01, P3-05). */
const COMING_SOON: ReadonlySet<number> = new Set([6, 7, 8]);

const STATUS_LABEL = { todo: '', done: 'Done', skipped: 'Skipped' } as const;

/** Spec §3: the first-time setup wizard. Saves on continue, resumes, jumps, skips optional steps. */
export function SetupWizard({ client, householdName, onExit }: SetupWizardProps) {
  const can = useCan();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [firstOpened, setFirstOpened] = useState(false);
  const [firstChoice, setFirstChoice] = useState<FirstMonthChoice>('this');

  useEffect(() => {
    let cancelled = false;
    client.setupProgress.query().then(
      (rows) => {
        if (cancelled) return;
        const progress: SetupProgress = Object.fromEntries(rows.map((r) => [r.step, r.status]));
        setLoad({ kind: 'ready', progress, current: resumeStep(progress, COMING_SOON) });
      },
      () => !cancelled && setLoad({ kind: 'error' }),
    );
    return () => {
      cancelled = true;
    };
  }, [client]);

  if (load.kind === 'loading') return <p role="status">Loading…</p>;
  if (load.kind === 'error') return <p role="alert">{GENERIC_ERROR}</p>;

  const { progress, current } = load;
  const step = SETUP_STEPS[current - 1];
  if (step === undefined) return null;
  const doneCount = SETUP_STEPS.filter(
    (s) => shownStatus(progress, s.id, COMING_SOON) === 'done',
  ).length;
  const soon = COMING_SOON.has(step.id);

  const goTo = (id: number) => {
    setSaveFailed(false);
    setBlocked(null);
    setLoad({ kind: 'ready', progress, current: id });
  };

  const save = async (status: 'done' | 'skipped') => {
    setSaving(true);
    setSaveFailed(false);
    setBlocked(null);
    try {
      // Step 2 needs at least one account before it can be finished.
      if (step.id === 2 && status === 'done') {
        const { accounts } = await client.setupAccounts.query();
        const problem = setupAccountsError(accounts.length);
        if (problem !== undefined) {
          setBlocked(problem);
          return;
        }
      }
      // Step 3 is skipped, or finished with at least one running paycheck.
      if (step.id === 3 && status === 'done') {
        const { schedules } = await client.setupPaychecks.query();
        const problem = setupPaychecksError(schedules.filter((s) => s.endedOn === null).length);
        if (problem !== undefined) {
          setBlocked(problem);
          return;
        }
      }
      // Step 1 commits the month first; once it is saved the choice is final.
      if (
        step.id === 1 &&
        status === 'done' &&
        stepStatus(progress, 1) !== 'done' &&
        !firstOpened
      ) {
        await client.startFirstMonth.mutate({ choice: firstChoice });
      }
      await client.saveSetupStep.mutate({ step: step.id, status });
      if (step.id === LAST) {
        onExit();
        return;
      }
      setLoad({
        kind: 'ready',
        progress: markStep(progress, step.id, status),
        current: Math.min(step.id + 1, LAST),
      });
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="wizard">
      <aside className="wizard-side">
        <p className="brand">{`Set up ${householdName}`}</p>
        <p className="wizard-count">{`${doneCount} of ${LAST} steps done`}</p>
        <div
          className="wizard-bar"
          role="progressbar"
          aria-label="Setup progress"
          aria-valuemin={0}
          aria-valuemax={LAST}
          aria-valuenow={doneCount}
        >
          <span style={{ width: `${(doneCount / LAST) * 100}%` }} />
        </div>
        <nav aria-label="Setup steps">
          <ol className="wizard-steps">
            {SETUP_STEPS.map((s) => {
              const status = shownStatus(progress, s.id, COMING_SOON);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    className={`wizard-step wizard-step-${status}`}
                    aria-current={s.id === current ? 'step' : undefined}
                    onClick={() => goTo(s.id)}
                  >
                    <span className="wizard-badge" aria-hidden="true">
                      {status === 'done' ? '✓' : s.id}
                    </span>
                    <span>
                      <strong>{s.title}</strong>
                      <small>{status === 'todo' ? s.hint : STATUS_LABEL[status]}</small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
        <p className="wizard-note">
          <strong>Saved as you go.</strong> Leave any time and pick up where you stopped. Your
          partner can help finish it once they join.
        </p>
        <button type="button" className="button button-quiet" onClick={onExit}>
          Leave setup
        </button>
      </aside>

      <main className="wizard-main">
        <p className="wizard-kicker">{`Step ${step.id} of ${LAST}`}</p>
        <h1>{step.title}</h1>
        {!step.required && <p className="wizard-optional">Optional</p>}
        <p className="wizard-lead">{step.hint}</p>

        {step.id === LAST ? (
          <ReviewList progress={progress} onJump={goTo} />
        ) : step.id === 1 ? (
          <WelcomeStep
            client={client}
            done={stepStatus(progress, 1) === 'done'}
            choice={firstChoice}
            onChoice={setFirstChoice}
            onOpened={setFirstOpened}
          />
        ) : step.id === 2 ? (
          <AccountsStep client={client} />
        ) : step.id === 3 ? (
          <PaychecksStep client={client} />
        ) : step.id === 4 ? (
          <CategoriesStep client={client} />
        ) : step.id === 5 ? (
          <RecurringBillsStep client={client} />
        ) : (
          soon && <p className="wizard-soon">Coming soon</p>
        )}

        {blocked !== null && <p role="alert">{blocked}</p>}
        {saveFailed && <p role="alert">{GENERIC_ERROR}</p>}

        <div className="wizard-actions">
          {step.id > 1 && (
            <button type="button" className="button button-quiet" onClick={() => goTo(step.id - 1)}>
              ← Back
            </button>
          )}
          <span className="wizard-actions-end">
            {can.write && !step.required && (
              <button
                type="button"
                className="button button-quiet"
                disabled={saving}
                onClick={() => void save('skipped')}
              >
                Skip for now
              </button>
            )}
            {can.write && !soon && step.id < LAST && (
              <button
                type="button"
                className="button"
                disabled={saving}
                onClick={() => void save('done')}
              >
                Save & continue
              </button>
            )}
            {can.write && step.id === LAST && (
              <button
                type="button"
                className="button"
                disabled={saving}
                onClick={() => void save('done')}
              >
                Finish setup
              </button>
            )}
            {(!can.write || soon) && step.id < LAST && (
              <button type="button" className="button" onClick={() => goTo(step.id + 1)}>
                Next →
              </button>
            )}
          </span>
        </div>
      </main>
    </div>
  );
}

const REVIEW_STATUS = { todo: 'Not started', done: 'Done', skipped: 'Skipped' } as const;

function reviewLabel({ status, comingSoon }: ReviewRow): string {
  if (!comingSoon) return REVIEW_STATUS[status];
  return status === 'skipped' ? 'Skipped · Coming soon' : 'Coming soon';
}

/** Spec §3 step 9: each step with its state and Edit, Add now or Finish this (View if read-only). */
function ReviewList({
  progress,
  onJump,
}: {
  progress: SetupProgress;
  onJump: (id: number) => void;
}) {
  const can = useCan();
  return (
    <ul className="wizard-review" aria-label="Review">
      {reviewRows(progress, COMING_SOON).map((row) => (
        <li key={row.id}>
          <span className="wizard-review-title">{row.title}</span>
          <span className={`wizard-review-status wizard-review-${row.status}`}>
            {reviewLabel(row)}
          </span>
          <button type="button" className="button button-quiet" onClick={() => onJump(row.id)}>
            {can.write ? row.action : 'View'}
          </button>
        </li>
      ))}
    </ul>
  );
}
