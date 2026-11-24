import { z } from 'zod';

export type SetupProgress = Partial<Record<number, 'done' | 'skipped'>>;
export type StepStatus = 'todo' | 'done' | 'skipped';
export interface SetupStep {
  id: number;
  title: string;
  required: boolean;
}
export const SETUP_STEPS: readonly SetupStep[] = [];
export function stepStatus(_progress: SetupProgress, _id: number): StepStatus {
  throw new Error('not implemented');
}
export function resumeStep(_progress: SetupProgress): number {
  throw new Error('not implemented');
}
export function markStep(_p: SetupProgress, _id: number, _s: 'done' | 'skipped'): SetupProgress {
  throw new Error('not implemented');
}
export interface ReviewRow {
  id: number;
  title: string;
  status: StepStatus;
  action: 'Edit' | 'Add now' | 'Finish this';
}
export function reviewRows(_progress: SetupProgress): ReviewRow[] {
  throw new Error('not implemented');
}

export const saveSetupStepInput = z.object({ step: z.number(), status: z.string() });
