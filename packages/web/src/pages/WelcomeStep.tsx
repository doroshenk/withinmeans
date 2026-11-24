import type { FirstMonthChoice } from '@withinmeans/domain';

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

/** Spec §3 step 1: this month (catch up from the 1st) or next month (start fresh). */
export function WelcomeStep(_props: WelcomeStepProps) {
  return null;
}
