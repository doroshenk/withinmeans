import { describe, expect, it } from 'vitest';
import {
  SETUP_STEPS,
  markStep,
  resumeStep,
  reviewRows,
  saveSetupStepInput,
  stepStatus,
  type SetupProgress,
} from './setupWizard';

describe('setup wizard (spec §3)', () => {
  it('has the 9 steps in order; 3, 6 and 7 are the optional ones', () => {
    expect(SETUP_STEPS.map((s) => s.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(SETUP_STEPS.filter((s) => !s.required).map((s) => s.id)).toEqual([3, 6, 7]);
    expect(SETUP_STEPS[3]?.title).toBe('Bill categories');
  });

  it('lists each step with its title, hint and whether it is required', () => {
    expect(SETUP_STEPS.map((s) => [s.id, s.title, s.hint, s.required])).toEqual([
      [1, 'Welcome', 'Pick your first month', true],
      [2, 'Bank accounts', 'Balances and your cushion', true],
      [3, 'Paychecks', 'When and how much', false],
      [4, 'Bill categories', 'How you group your bills', true],
      [5, 'Recurring bills', 'The bills that come every month', true],
      [6, 'Credit cards', 'Nicknames and due days', false],
      [7, 'Investments', 'Holdings and current prices', false],
      [8, 'Where income goes', 'Your starting splits', true],
      [9, 'Review & finish', 'Check everything over', true],
    ]);
  });

  it('resumes at step 1 when nothing is saved', () => {
    expect(resumeStep({})).toBe(1);
  });

  it('resumes at the first unfinished step, not just after the last finished one', () => {
    const progress: SetupProgress = { 1: 'done', 2: 'done', 4: 'done' };
    expect(resumeStep(progress)).toBe(3);
  });

  it('counts skipped steps as finished when resuming', () => {
    expect(resumeStep({ 1: 'done', 2: 'done', 3: 'skipped' })).toBe(4);
  });

  it('resumes at the last step once everything is finished', () => {
    const all = Object.fromEntries(SETUP_STEPS.map((s) => [s.id, 'done'])) as SetupProgress;
    expect(resumeStep(all)).toBe(9);
  });

  it('reports todo, done or skipped for a step', () => {
    const progress: SetupProgress = { 1: 'done', 3: 'skipped' };
    expect(stepStatus(progress, 1)).toBe('done');
    expect(stepStatus(progress, 3)).toBe('skipped');
    expect(stepStatus(progress, 2)).toBe('todo');
  });

  it('markStep returns a new object and leaves the old one alone', () => {
    const before: SetupProgress = { 1: 'done' };
    const after = markStep(before, 2, 'done');
    expect(after).toEqual({ 1: 'done', 2: 'done' });
    expect(before).toEqual({ 1: 'done' });
  });

  it('only optional steps can be skipped', () => {
    expect(markStep({}, 3, 'skipped')).toEqual({ 3: 'skipped' });
    expect(() => markStep({}, 2, 'skipped')).toThrow('Step 2 is required');
  });

  it('rejects a step number outside 1..9', () => {
    expect(() => markStep({}, 10, 'done')).toThrow('Unknown step 10');
  });

  it('Review lists every step; skipped optional steps say so, unfinished ones offer Finish this / Add now', () => {
    const rows = reviewRows({ 1: 'done', 3: 'skipped' });
    expect(rows).toHaveLength(8); // every step except Review itself
    expect(rows[0]).toMatchObject({ id: 1, status: 'done', action: 'Edit' });
    expect(rows[2]).toMatchObject({ id: 3, status: 'skipped', action: 'Add now' });
    expect(rows[1]).toMatchObject({ id: 2, status: 'todo', action: 'Finish this' });
    expect(rows[5]).toMatchObject({ id: 6, status: 'todo', action: 'Add now' });
  });

  it('P1-13: Review reflects saved, skipped and coming-soon steps correctly', () => {
    const progress: SetupProgress = { 1: 'done', 3: 'skipped', 7: 'done' };
    const rows = reviewRows(progress, new Set([3, 6, 7, 8]));

    expect(rows.map((r) => [r.id, r.status, r.comingSoon, r.action])).toEqual([
      [1, 'done', false, 'Edit'],
      [2, 'todo', false, 'Finish this'],
      [3, 'skipped', true, 'Add now'],
      [4, 'todo', false, 'Finish this'],
      [5, 'todo', false, 'Finish this'],
      [6, 'todo', true, 'Add now'],
      // Saved as done before the screen exists: nothing was entered, so it is not done.
      [7, 'todo', true, 'Add now'],
      [8, 'todo', true, 'Finish this'],
    ]);
  });

  it('P1-13: after finishing, resuming never lands on a coming-soon step', () => {
    const comingSoon = new Set([3, 6, 7, 8]);
    const finished: SetupProgress = { 1: 'done', 2: 'done', 4: 'done', 5: 'done', 9: 'done' };
    expect(resumeStep(finished, comingSoon)).toBe(9);
    // A real step that is still unfinished is where to go.
    expect(resumeStep({ 1: 'done', 9: 'done' }, comingSoon)).toBe(2);
  });

  it('P1-13: no step is coming soon unless it is listed', () => {
    expect(reviewRows({}).every((r) => !r.comingSoon)).toBe(true);
  });

  it('the save input takes a step 1..9 and done or skipped', () => {
    expect(saveSetupStepInput.safeParse({ step: 3, status: 'skipped' }).success).toBe(true);
    expect(saveSetupStepInput.safeParse({ step: 9, status: 'done' }).success).toBe(true);
    for (const bad of [
      { step: 2, status: 'skipped' },
      { step: 0, status: 'done' },
      { step: 10, status: 'done' },
      { step: 1.5, status: 'done' },
      { step: 2, status: 'todo' },
    ]) {
      expect(saveSetupStepInput.safeParse(bad).success).toBe(false);
    }
  });
});
