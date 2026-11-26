import type { PayFrequency } from '@withinmeans/domain';

export const FREQUENCY_LABEL: Record<PayFrequency, string> = {
  weekly: 'Every week',
  biweekly: 'Every 2 weeks',
  semimonthly: 'Twice a month',
  monthly: 'Once a month',
};
