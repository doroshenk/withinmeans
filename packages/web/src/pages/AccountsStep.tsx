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
      type: 'checking' | 'savings' | 'cash';
      balanceCents: number;
    }) => Promise<{ id: string }>;
  };
  removeAccount: { mutate: (input: { id: string }) => Promise<unknown> };
  setCushion: { mutate: (input: { cushionCents: number }) => Promise<unknown> };
}

/** Spec §3 step 2: bank accounts and the checking cushion. */
export function AccountsStep(_props: { client: AccountsClient }) {
  return null;
}
