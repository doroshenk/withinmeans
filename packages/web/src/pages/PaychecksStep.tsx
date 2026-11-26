import type { PayFrequency } from '@withinmeans/domain';

export interface PayRow {
  id: string;
  name: string;
  frequency: PayFrequency;
  anchorDate: string;
  semimonthlyDays: [number, number] | null;
  usualCents: number;
  endedOn: string | null;
}

export interface PaychecksClient {
  setupPaychecks: { query: () => Promise<{ today: string; schedules: PayRow[] }> };
  addPaySchedule: {
    mutate: (input: {
      name: string;
      frequency: PayFrequency;
      anchorDate: string;
      semimonthlyDays?: [number, number];
      usualCents: number;
    }) => Promise<{ id: string }>;
  };
  removePaySchedule: { mutate: (input: { id: string }) => Promise<unknown> };
}

/** Spec §3 step 3: pay schedules. Not built yet. */
export function PaychecksStep(_props: { client: PaychecksClient }) {
  return null;
}
