import { z } from 'zod';

/** What is saved for a step. A step with no entry is not finished yet. */
export type SetupProgress = Partial<Record<number, 'done' | 'skipped'>>;
export type StepStatus = 'todo' | 'done' | 'skipped';

export interface SetupStep {
  id: number;
  title: string;
  /** One line under the title in the stepper. */
  hint: string;
  required: boolean;
}

/** Spec §3, first-time setup wizard: the nine steps in order. */
export const SETUP_STEPS: readonly SetupStep[] = [
  { id: 1, title: 'Welcome', hint: 'Pick your first month', required: true },
  { id: 2, title: 'Bank accounts', hint: 'Balances and your cushion', required: true },
  { id: 3, title: 'Paychecks', hint: 'When and how much', required: false },
  { id: 4, title: 'Bill categories', hint: 'How you group your bills', required: true },
  { id: 5, title: 'Recurring bills', hint: 'The bills that come every month', required: true },
  { id: 6, title: 'Credit cards', hint: 'Nicknames and due days', required: false },
  { id: 7, title: 'Investments', hint: 'Holdings and current prices', required: false },
  { id: 8, title: 'Where income goes', hint: 'Your starting splits', required: true },
  { id: 9, title: 'Review & finish', hint: 'Check everything over', required: true },
];

const LAST_STEP = SETUP_STEPS.length;

/** The input of the "save a step" call: a step 1..9, finished or skipped. */
export const saveSetupStepInput = z
  .object({
    step: z.number().int().min(1).max(LAST_STEP),
    status: z.enum(['done', 'skipped']),
  })
  .refine((v) => v.status === 'done' || SETUP_STEPS[v.step - 1]?.required === false, {
    message: 'Only optional steps can be skipped.',
    path: ['status'],
  });

export function stepStatus(progress: SetupProgress, id: number): StepStatus {
  return progress[id] ?? 'todo';
}

/** Where to resume: the first step that is neither done nor skipped (the last step when all are). */
export function resumeStep(progress: SetupProgress): number {
  return SETUP_STEPS.find((s) => stepStatus(progress, s.id) === 'todo')?.id ?? LAST_STEP;
}

/** Returns a new progress with the step saved. Only optional steps may be skipped. */
export function markStep(
  progress: SetupProgress,
  id: number,
  status: 'done' | 'skipped',
): SetupProgress {
  const step = SETUP_STEPS.find((s) => s.id === id);
  if (step === undefined) throw new Error(`Unknown step ${id}`);
  if (status === 'skipped' && step.required) throw new Error(`Step ${id} is required`);
  return { ...progress, [id]: status };
}

export interface ReviewRow {
  id: number;
  title: string;
  status: StepStatus;
  /** Edit a finished step, Add now for an optional one, Finish this for a required one. */
  action: 'Edit' | 'Add now' | 'Finish this';
}

/** Spec §3 step 9: every step except Review itself, with what to do about it. */
export function reviewRows(progress: SetupProgress): ReviewRow[] {
  return SETUP_STEPS.filter((s) => s.id !== LAST_STEP).map((s) => {
    const status = stepStatus(progress, s.id);
    const action = status === 'done' ? 'Edit' : s.required ? 'Finish this' : 'Add now';
    return { id: s.id, title: s.title, status, action };
  });
}
