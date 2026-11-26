import type { PaychecksClient } from './PaychecksStep';

/** Test helper: the paycheck calls of a client, for tests that are not about paychecks. */
export const paychecksStub: PaychecksClient = {
  setupPaychecks: { query: () => Promise.resolve({ today: '2026-11-18', schedules: [] }) },
  addPaySchedule: { mutate: () => Promise.resolve({ id: 'p1' }) },
  removePaySchedule: { mutate: () => Promise.resolve({}) },
};
