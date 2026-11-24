import { monthLabel, type FirstMonthChoice } from '@withinmeans/domain';
import { useEffect, useState } from 'react';
import { GENERIC_ERROR } from '../auth/errors';
import { useCan } from '../permissions';

export interface FirstMonthOptions {
  thisMonth: string;
  nextMonth: string;
  firstMonth: string;
  opened: boolean;
}

export interface WelcomeClient {
  firstMonthOptions: { query: () => Promise<FirstMonthOptions> };
  startFirstMonth: {
    mutate: (input: { choice: FirstMonthChoice }) => Promise<{ firstMonth: string }>;
  };
}

export interface WelcomeStepProps {
  client: WelcomeClient;
  /** Step 1 is already saved: show the chosen month, no choice. */
  done: boolean;
  choice: FirstMonthChoice;
  onChoice: (choice: FirstMonthChoice) => void;
}

type Load = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; options: FirstMonthOptions };

/** Spec §3 step 1: this month (catch up from the 1st) or next month (start fresh). */
export function WelcomeStep({ client, done, choice, onChoice }: WelcomeStepProps) {
  const can = useCan();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    client.firstMonthOptions.query().then(
      (options) => !cancelled && setLoad({ kind: 'ready', options }),
      () => !cancelled && setLoad({ kind: 'error' }),
    );
    return () => {
      cancelled = true;
    };
  }, [client]);

  if (load.kind === 'loading') return <p role="status">Loading…</p>;
  if (load.kind === 'error') return <p role="alert">{GENERIC_ERROR}</p>;
  const { options } = load;

  if (done) {
    return <p>{`Your first month is ${monthLabel(options.firstMonth)}.`}</p>;
  }

  const choices: { value: FirstMonthChoice; title: string; ym: string; hint: string }[] = [
    { value: 'this', title: 'This month', ym: options.thisMonth, hint: 'Catch up from the 1st' },
    { value: 'next', title: 'Next month', ym: options.nextMonth, hint: 'Start fresh' },
  ];

  return (
    <div className="modes" role="radiogroup" aria-label="First month">
      {choices.map((c) => (
        <label key={c.value} className={`mode${choice === c.value ? ' on' : ''}`}>
          <input
            type="radio"
            name="first-month"
            checked={choice === c.value}
            disabled={!can.write}
            onChange={() => onChoice(c.value)}
          />
          <span>
            <strong>{c.title}</strong>
            <span>{monthLabel(c.ym)}</span>
            <span>{c.hint}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
