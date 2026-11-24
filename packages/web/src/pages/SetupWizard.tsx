export interface SetupClient {
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

export function SetupWizard(_props: SetupWizardProps) {
  return <p>not implemented</p>;
}
