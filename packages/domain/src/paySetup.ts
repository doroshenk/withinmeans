import type { Cents } from './money';
import type { PayFrequency, PayScheduleTemplate } from './paychecks';

export interface PayDraft {
  name: string;
  frequency: PayFrequency;
  anchorDate: string;
  takeHomeText: string;
  /** Twice-a-month pay only. */
  dayTexts: readonly [string, string];
}

export function monthlyPayCents(
  _schedules: readonly Pick<PayScheduleTemplate, 'frequency' | 'usualCents' | 'endedOn'>[],
): Cents | null {
  throw new Error('not implemented');
}

export function nextPaydays(
  _schedule: Pick<PayScheduleTemplate, 'frequency' | 'anchorDate' | 'semimonthlyDays'>,
  _from: string,
): string[] {
  throw new Error('not implemented');
}

export function payDraftError(_draft: PayDraft): string | undefined {
  throw new Error('not implemented');
}

export function setupPaychecksError(_count: number): string | undefined {
  throw new Error('not implemented');
}
