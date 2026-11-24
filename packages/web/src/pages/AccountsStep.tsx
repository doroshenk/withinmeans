import {
  SETUP_ACCOUNT_TYPES,
  accountDraftError,
  dollarText,
  formatMoney,
  parseDollars,
  type SetupAccountType,
} from '@withinmeans/domain';
import { useCallback, useEffect, useState } from 'react';
import { GENERIC_ERROR, apiErrorMessage } from '../auth/errors';
import { useCan } from '../permissions';

export interface AccountRow {
  id: string;
  name: string;
  type: 'checking' | 'savings' | 'cash' | 'brokerage';
  balanceCents: number | null;
  isPrimaryChecking: boolean;
}

export interface SetupAccountsData {
  accounts: AccountRow[];
  cushionCents: number;
}

export interface AccountsClient {
  setupAccounts: { query: () => Promise<SetupAccountsData> };
  addAccount: {
    mutate: (input: {
      name: string;
      type: SetupAccountType;
      balanceCents: number;
    }) => Promise<{ id: string }>;
  };
  removeAccount: { mutate: (input: { id: string }) => Promise<unknown> };
  setCushion: { mutate: (input: { cushionCents: number }) => Promise<unknown> };
}

type Load = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; data: SetupAccountsData };

const TYPE_LABEL: Record<AccountRow['type'], string> = {
  checking: 'Checking',
  savings: 'Savings',
  cash: 'Cash',
  brokerage: 'Brokerage',
};

/** Spec §3 step 2: bank accounts (name, type, balance today) and the checking cushion. */
export function AccountsStep({ client }: { client: AccountsClient }) {
  const can = useCan();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [name, setName] = useState('');
  const [type, setType] = useState<SetupAccountType>('checking');
  const [balance, setBalance] = useState('');
  const [cushionDraft, setCushionDraft] = useState<string | undefined>(undefined);
  const [problem, setProblem] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const data = await client.setupAccounts.query();
    setLoad({ kind: 'ready', data });
    setCushionDraft(undefined);
  }, [client]);

  useEffect(() => {
    let cancelled = false;
    client.setupAccounts.query().then(
      (data) => !cancelled && setLoad({ kind: 'ready', data }),
      () => !cancelled && setLoad({ kind: 'error' }),
    );
    return () => {
      cancelled = true;
    };
  }, [client]);

  if (load.kind === 'loading') return <p role="status">Loading…</p>;
  if (load.kind === 'error') return <p role="alert">{GENERIC_ERROR}</p>;
  const { data } = load;

  /** Runs one change, then shows what the server now has. */
  const act = async (change: () => Promise<unknown>) => {
    setProblem(null);
    try {
      await change();
      await reload();
    } catch (error) {
      setProblem(apiErrorMessage(error));
    }
  };

  const add = async () => {
    const error = accountDraftError({ name, type, balanceText: balance });
    if (error !== undefined) {
      setProblem(error);
      return;
    }
    await act(async () => {
      await client.addAccount.mutate({
        name: name.trim(),
        type,
        balanceCents: parseDollars(balance) ?? 0,
      });
      setName('');
      setBalance('');
    });
  };

  const saveCushion = async () => {
    if (cushionDraft === undefined) return;
    const cushionCents = parseDollars(cushionDraft);
    if (cushionCents === undefined || cushionCents < 0) {
      setProblem('Enter the cushion as a dollar amount, like 1,000.');
      setCushionDraft(undefined);
      return;
    }
    if (cushionCents === data.cushionCents) {
      setCushionDraft(undefined);
      return;
    }
    await act(() => client.setCushion.mutate({ cushionCents }));
  };

  return (
    <div className="accounts">
      {data.accounts.length === 0 ? (
        <p>
          {can.write
            ? 'No accounts yet. Add the account your paychecks land in first.'
            : 'No accounts yet. The owner or a full member will set them up.'}
        </p>
      ) : (
        <ul className="account-list" aria-label="Accounts">
          {data.accounts.map((account) => (
            <li key={account.id} className="account-row">
              <span className="account-main">
                <strong>{account.name}</strong>
                <small>
                  {TYPE_LABEL[account.type]}
                  {account.isPrimaryChecking && ' · '}
                  {account.isPrimaryChecking && <span>Primary checking</span>}
                </small>
              </span>
              <span className="account-balance">
                {account.balanceCents === null ? 'No balance' : formatMoney(account.balanceCents)}
              </span>
              {can.write && (
                <button
                  type="button"
                  className="category-delete"
                  aria-label={`Remove ${account.name}`}
                  onClick={() => void act(() => client.removeAccount.mutate({ id: account.id }))}
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {problem !== null && <p role="alert">{problem}</p>}

      {can.write && (
        <form
          className="account-add"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <label>
            Account name
            <input
              type="text"
              placeholder="e.g. Joint checking"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Type
            <select value={type} onChange={(e) => setType(e.target.value as SetupAccountType)}>
              {SETUP_ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Balance today
            <input
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
            />
          </label>
          <button type="submit" className="button">
            Add account
          </button>
        </form>
      )}

      <div className="account-cushion">
        <label htmlFor="cushion">Checking cushion</label>
        <input
          id="cushion"
          type="text"
          inputMode="decimal"
          value={cushionDraft ?? dollarText(data.cushionCents)}
          readOnly={!can.write}
          onChange={(e) => setCushionDraft(e.target.value)}
          onBlur={() => void saveCushion()}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <p className="account-help">
          The lowest your checking balance should ever get. The forecast shows how far above it you
          stay. Change it any time on the Accounts page.
        </p>
      </div>
    </div>
  );
}
