import { Temporal } from 'temporal-polyfill';
import { parseDollars } from './accounts';
import { addMonths, monthOf } from './dates';
import { sumCents, type Cents } from './money';
import { paydaysForMonth } from './paydays';
import { paydaySchedule, type PayFrequency, type PayScheduleTemplate } from './paychecks';

/** Paychecks in a typical month: months with an extra payday are left out. */
const PAYCHECKS_PER_MONTH: Record<PayFrequency, number> = {
  weekly: 4,
  biweekly: 2,
  semimonthly: 2,
  monthly: 1,
};

/**
 * Spec §3 steps 3 and 5: take-home pay in a typical month from the schedules still running, or null
 * when there are none.
 */
export function monthlyPayCents(
  schedules: readonly Pick<PayScheduleTemplate, 'frequency' | 'usualCents' | 'endedOn'>[],
): Cents | null {
  const running = schedules.filter((s) => s.endedOn === null);
  if (running.length === 0) return null;
  return sumCents(running.map((s) => s.usualCents * PAYCHECKS_PER_MONTH[s.frequency]));
}

/** The next `count` paydays on or after `from` ("YYYY-MM-DD"), in order. */
export function nextPaydays(
  schedule: Pick<PayScheduleTemplate, 'frequency' | 'anchorDate' | 'semimonthlyDays'>,
  from: string,
  count = 3,
): string[] {
  const paydays: string[] = [];
  // Every month has at least one payday, so this ends.
  for (let ym = monthOf(Temporal.PlainDate.from(from)); paydays.length < count;) {
    const inMonth = paydaysForMonth(paydaySchedule(schedule), ym).map((date) => date.toString());
    paydays.push(...inMonth.filter((date) => date >= from));
    ym = addMonths(ym, 1);
  }
  return paydays.slice(0, count);
}

export interface PayDraft {
  name: string;
  frequency: PayFrequency;
  anchorDate: string;
  takeHomeText: string;
  /** Twice-a-month pay only. */
  dayTexts: readonly [string, string];
}

/** The two days of twice-a-month pay as numbers, or undefined unless they are usable. */
export function parsePayDays(texts: readonly [string, string]): [number, number] | undefined {
  const day = (text: string) => (/^\d{1,2}$/.test(text.trim()) ? Number(text.trim()) : 0);
  const [first, second] = [day(texts[0]), day(texts[1])];
  const valid = (n: number) => n >= 1 && n <= 31;
  return valid(first) && valid(second) && first !== second ? [first, second] : undefined;
}

/** A real date written "YYYY-MM-DD". */
export function isPayDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  try {
    Temporal.PlainDate.from(text, { overflow: 'reject' });
    return true;
  } catch {
    return false;
  }
}

/** Spec §3 step 3: name, take-home > 0, a valid date. */
export function payDraftError(draft: PayDraft): string | undefined {
  if (draft.name.trim() === '') return 'Enter a name for this paycheck.';
  const takeHome = parseDollars(draft.takeHomeText);
  if (takeHome === undefined || takeHome <= 0) return 'Enter a take-home above $0.';
  if (!isPayDate(draft.anchorDate)) return 'Pick a recent payday.';
  if (draft.frequency === 'semimonthly' && parsePayDays(draft.dayTexts) === undefined) {
    return 'Pick two different pay days from 1 to 31.';
  }
  return undefined;
}

/** Step 3 is optional: it is either skipped or has a paycheck. */
export function setupPaychecksError(count: number): string | undefined {
  return count > 0 ? undefined : 'Add a paycheck, or skip this step.';
}
