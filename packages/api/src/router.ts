import { initTRPC, TRPCError } from '@trpc/server';
import {
  acceptInviteInput,
  addAccountInput,
  addRecurringBillInput,
  endRecurringBillInput,
  restartRecurringBillInput,
  updateRecurringBillInput,
  removeRecurringBillInput,
  removeAccountInput,
  setCushionInput,
  createCategoryInput,
  deleteCategoryInput,
  invitePartnerInput,
  recolorCategoryInput,
  seedCategoriesInput,
  renameCategoryInput,
  saveSetupStepInput,
  signUpInput,
  startFirstMonthInput,
  addPayScheduleInput,
  markPaycheckReceivedInput,
  monthPaychecksInput,
  payScheduleIdInput,
  paycheckIdInput,
  paychecksPageInput,
  updatePayScheduleInput,
  addOtherIncomeInput,
  otherIncomeInput,
  removeOtherIncomeInput,
  addBillInput,
  billsPageInput,
  openMonthInput,
  removeBillInput,
  setBillPaidInput,
  updateBillInput,
  addCreditCardInput,
  markCardPaidInput,
  removeCreditCardInput,
  saveCardStatementInput,
  unmarkCardPaidInput,
} from '@withinmeans/domain';
import { setupProgress } from '@withinmeans/db';
import { z } from 'zod';
import { acceptInvite, inviteDetails } from './acceptInvite.js';
import {
  createCategory,
  deleteCategory,
  listCategories,
  recolorCategory,
  renameCategory,
  seedDefaultCategories,
} from './categories.js';
import {
  addBill,
  billsPage,
  openBillsMonth,
  removeBill,
  setBillPaid,
  updateBill,
} from './bills.js';
import type { Context } from './context.js';
import {
  addCreditCard,
  listCreditCards,
  markCardPaid,
  removeCreditCard,
  saveCardStatement,
  unmarkCardPaid,
} from './creditCards.js';
import { exportData } from './exportData.js';
import { firstMonthOptions, startFirstMonth } from './firstMonth.js';
import { invitePartner, resendInvite } from './invitePartner.js';
import {
  addPaySchedule,
  listPaychecks,
  listPaySchedules,
  markPaycheckReceived,
  paychecksPage,
  restartPaySchedule,
  stopPaySchedule,
  unmarkPaycheckReceived,
  updatePaySchedule,
} from './paychecks.js';
import { addOtherIncome, listOtherIncome, removeOtherIncome } from './otherIncome.js';
import {
  addSetupAccount,
  requireAccounts,
  listSetupAccounts,
  removeSetupAccount,
  saveCushion,
} from './setupAccounts.js';
import {
  endRecurringBill,
  listRecurringBills,
  restartRecurringBill,
  updateRecurringBill,
} from './recurringBills.js';
import { addSetupBill, listSetupBills, removeSetupBill } from './setupBills.js';
import { listSetupPaychecks, removePaySchedule } from './setupPaychecks.js';
import { signUp } from './signUp.js';

const GENERIC_MESSAGE = 'Something went wrong. Please try again.';

const t = initTRPC.context<Context>().create({
  isDev: false,
  // Unhandled errors tell the browser nothing; the details go to the log (see handler.ts).
  errorFormatter({ shape }) {
    if (shape.data.code !== 'INTERNAL_SERVER_ERROR') return shape;
    return { ...shape, message: GENERIC_MESSAGE };
  },
});

const signedIn = t.middleware(({ ctx, next }) => {
  if (ctx.auth === undefined) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx: { ...ctx, auth: ctx.auth } });
});

export const protectedProcedure = t.procedure.use(signedIn);

/** Signed in and in a household. The household context comes from the Membership, never input. */
const inHousehold = t.middleware(({ ctx, next }) => {
  const { household, identity } = ctx;
  if (household === undefined || identity?.membership === undefined) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Join or create a household first.' });
  }
  const { membership } = identity;
  return next({ ctx: { ...ctx, household, identity: { ...identity, membership } } });
});

export const memberProcedure = protectedProcedure.use(inHousehold);

/**
 * Spec §3: view-only members cannot create, edit or delete. Every write procedure is built on
 * this, and the check runs before input is parsed. Add new write procedures to the T21 table in
 * permissions.test.ts.
 */
const canWrite = t.middleware(({ ctx, next }) => {
  if (ctx.household?.role === 'view') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'View-only members cannot make changes.' });
  }
  return next();
});

export const writeProcedure = memberProcedure.use(canWrite);

export const publicProcedure = t.procedure;

export const appRouter = t.router({
  /** Creates a login, a household and the owner's membership. Open to anyone; see signUp.ts. */
  signUp: publicProcedure.input(signUpInput).mutation(({ ctx, input }) => signUp(ctx, input)),

  /** Spec §3, accepting an invite: what the accept screen shows. The token is the credential. */
  inviteDetails: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(({ ctx, input }) => inviteDetails(ctx, input.token)),

  /** Spec §3, accepting an invite: the partner's own login and Membership. */
  acceptInvite: publicProcedure
    .input(acceptInviteInput)
    .mutation(({ ctx, input }) => acceptInvite(ctx, input)),

  /** Spec §3 step 3: stores the invite and emails the accept link. */
  invitePartner: writeProcedure
    .input(invitePartnerInput)
    .mutation(({ ctx, input }) => invitePartner(ctx, input)),

  /** Resend: a new link and a fresh 7 days; the old link stops working. */
  resendInvite: writeProcedure
    .input(z.object({ inviteId: z.uuid() }))
    .mutation(({ ctx, input }) => resendInvite(ctx, input.inviteId)),

  /** Spec §3 wizard: which steps are done or skipped. */
  setupProgress: memberProcedure.query(async ({ ctx }) => {
    const rows = await setupProgress.list(ctx.db, ctx.household);
    return rows.map((r) => ({ step: r.step, status: r.status }));
  }),

  /** Spec §3 wizard: saved when the user continues or skips. */
  saveSetupStep: writeProcedure.input(saveSetupStepInput).mutation(async ({ ctx, input }) => {
    if (input.step === 2 && input.status === 'done') await requireAccounts(ctx);
    const row = await setupProgress.save(ctx.db, ctx.household, input.step, input.status);
    return { step: row.step, status: row.status };
  }),

  /** Spec §3 step 2: accounts with their balance today, and the checking cushion. */
  setupAccounts: memberProcedure.query(({ ctx }) => listSetupAccounts(ctx)),

  addAccount: writeProcedure
    .input(addAccountInput)
    .mutation(({ ctx, input }) => addSetupAccount(ctx, input)),

  removeAccount: writeProcedure
    .input(removeAccountInput)
    .mutation(({ ctx, input }) => removeSetupAccount(ctx, input)),

  setCushion: writeProcedure
    .input(setCushionInput)
    .mutation(({ ctx, input }) => saveCushion(ctx, input)),

  /** Spec §3 step 1: this month and next month, and whether the first month is already open. */
  firstMonthOptions: memberProcedure.query(({ ctx }) => firstMonthOptions(ctx)),

  /** Spec §3 step 1: choose this month or next; calls openMonth. */
  startFirstMonth: writeProcedure
    .input(startFirstMonthInput)
    .mutation(({ ctx, input }) => startFirstMonth(ctx, input)),

  /** Spec §3 step 4: categories with how many recurring bills use each. */
  categories: memberProcedure.query(({ ctx }) => listCategories(ctx)),

  /** Spec §3 step 4: the 7 starting categories, only when the household has none yet. */
  seedDefaultCategories: writeProcedure
    .input(seedCategoriesInput)
    .mutation(({ ctx }) => seedDefaultCategories(ctx)),

  createCategory: writeProcedure
    .input(createCategoryInput)
    .mutation(({ ctx, input }) => createCategory(ctx, input)),

  renameCategory: writeProcedure
    .input(renameCategoryInput)
    .mutation(({ ctx, input }) => renameCategory(ctx, input)),

  recolorCategory: writeProcedure
    .input(recolorCategoryInput)
    .mutation(({ ctx, input }) => recolorCategory(ctx, input)),

  /** Spec §4: bills move to the chosen category; without one, to the first (§3 step 4, T18). */
  deleteCategory: writeProcedure
    .input(deleteCategoryInput)
    .mutation(({ ctx, input }) => deleteCategory(ctx, input)),

  /** Spec §3 step 5: recurring bills, the monthly total and take-home (null until paychecks exist). */
  setupBills: memberProcedure.query(({ ctx }) => listSetupBills(ctx)),

  addRecurringBill: writeProcedure
    .input(addRecurringBillInput)
    .mutation(({ ctx, input }) => addSetupBill(ctx, input)),

  removeRecurringBill: writeProcedure
    .input(removeRecurringBillInput)
    .mutation(({ ctx, input }) => removeSetupBill(ctx, input)),

  /** Spec §6.3: all recurring bills, ended ones too, and today. */
  recurringBills: memberProcedure.query(({ ctx }) => listRecurringBills(ctx)),

  updateRecurringBill: writeProcedure
    .input(updateRecurringBillInput)
    .mutation(({ ctx, input }) => updateRecurringBill(ctx, input)),

  endRecurringBill: writeProcedure
    .input(endRecurringBillInput)
    .mutation(({ ctx, input }) => endRecurringBill(ctx, input)),

  restartRecurringBill: writeProcedure
    .input(restartRecurringBillInput)
    .mutation(({ ctx, input }) => restartRecurringBill(ctx, input)),

  /** Spec §5.9: pay schedules, running and stopped. */
  paySchedules: memberProcedure.query(({ ctx }) => listPaySchedules(ctx)),

  /** Spec §5.9: the paychecks expected in a month, received or not. */
  paychecks: memberProcedure
    .input(monthPaychecksInput)
    .query(({ ctx, input }) => listPaychecks(ctx, input.ym)),

  addPaySchedule: writeProcedure
    .input(addPayScheduleInput)
    .mutation(({ ctx, input }) => addPaySchedule(ctx, input)),

  /** Spec §3 step 3: today and the pay schedules. */
  setupPaychecks: memberProcedure.query(({ ctx }) => listSetupPaychecks(ctx)),

  /** Spec §3 step 3: takes back a paycheck added by mistake; one with history can only be stopped. */
  removePaySchedule: writeProcedure
    .input(payScheduleIdInput)
    .mutation(({ ctx, input }) => removePaySchedule(ctx, input)),

  /** Spec §5.9 "Stop this paycheck": ends it today. */
  stopPaySchedule: writeProcedure
    .input(payScheduleIdInput)
    .mutation(({ ctx, input }) => stopPaySchedule(ctx, input)),

  restartPaySchedule: writeProcedure
    .input(payScheduleIdInput)
    .mutation(({ ctx, input }) => restartPaySchedule(ctx, input)),

  /** Spec §5.9: the actual amount and date; replaces the expected amount. */
  markPaycheckReceived: writeProcedure
    .input(markPaycheckReceivedInput)
    .mutation(({ ctx, input }) => markPaycheckReceived(ctx, input)),

  /** Spec §6.4: a month's paychecks (this month when none is given) and the schedules. */
  paychecksPage: memberProcedure
    .input(paychecksPageInput)
    .query(({ ctx, input }) => paychecksPage(ctx, input.ym)),

  updatePaySchedule: writeProcedure
    .input(updatePayScheduleInput)
    .mutation(({ ctx, input }) => updatePaySchedule(ctx, input)),

  /** "Undo" on a received paycheck: back to the expected amount. */
  unmarkPaycheckReceived: writeProcedure
    .input(paycheckIdInput)
    .mutation(({ ctx, input }) => unmarkPaycheckReceived(ctx, input)),

  /** Spec §6.4: one-time income in a month (this month when none is given), and the form's lists. */
  otherIncome: memberProcedure
    .input(otherIncomeInput)
    .query(({ ctx, input }) => listOtherIncome(ctx, input.ym)),

  addOtherIncome: writeProcedure
    .input(addOtherIncomeInput)
    .mutation(({ ctx, input }) => addOtherIncome(ctx, input)),

  removeOtherIncome: writeProcedure
    .input(removeOtherIncomeInput)
    .mutation(({ ctx, input }) => removeOtherIncome(ctx, input)),

  /** Spec §6.2: a month's bills (this month when none is given), paychecks and income. */
  billsPage: memberProcedure
    .input(billsPageInput)
    .query(({ ctx, input }) => billsPage(ctx, input.ym)),

  /** Spec §5.11: the temporary "Open {month}" button on Bills, until the Start flow exists. */
  openMonth: writeProcedure
    .input(openMonthInput)
    .mutation(({ ctx, input }) => openBillsMonth(ctx, input)),

  /** Spec §6.2: a one-time bill, paid or still owed. */
  addBill: writeProcedure.input(addBillInput).mutation(({ ctx, input }) => addBill(ctx, input)),

  /** Changes one month's bill; the recurring bill stays as it is. */
  updateBill: writeProcedure
    .input(updateBillInput)
    .mutation(({ ctx, input }) => updateBill(ctx, input)),

  setBillPaid: writeProcedure
    .input(setBillPaidInput)
    .mutation(({ ctx, input }) => setBillPaid(ctx, input)),

  removeBill: writeProcedure
    .input(removeBillInput)
    .mutation(({ ctx, input }) => removeBill(ctx, input)),

  /** Spec §3 step 6: the cards still in use. */
  creditCards: memberProcedure.query(({ ctx }) => listCreditCards(ctx)),

  addCreditCard: writeProcedure
    .input(addCreditCardInput)
    .mutation(({ ctx, input }) => addCreditCard(ctx, input)),

  /** A card with statements is archived, so its months keep them. */
  removeCreditCard: writeProcedure
    .input(removeCreditCardInput)
    .mutation(({ ctx, input }) => removeCreditCard(ctx, input)),

  /** Spec §5.10: a card's balance, minimum and planned payment for a month. */
  saveCardStatement: writeProcedure
    .input(saveCardStatementInput)
    .mutation(({ ctx, input }) => saveCardStatement(ctx, input)),

  markCardPaid: writeProcedure
    .input(markCardPaidInput)
    .mutation(({ ctx, input }) => markCardPaid(ctx, input)),

  unmarkCardPaid: writeProcedure
    .input(unmarkCardPaidInput)
    .mutation(({ ctx, input }) => unmarkCardPaid(ctx, input)),

  /** Spec §8: the household's full JSON export. A read, so view-only members may call it. */
  exportData: memberProcedure.query(({ ctx }) => exportData(ctx)),

  /** Who am I? A signed-in user may have no profile or no household yet. */
  me: protectedProcedure.query(({ ctx }) => ({
    user:
      ctx.identity === undefined
        ? null
        : { name: ctx.identity.user.name, email: ctx.identity.user.email },
    household:
      ctx.identity?.membership === undefined
        ? null
        : { name: ctx.identity.membership.householdName, role: ctx.identity.membership.role },
  })),
});

export type AppRouter = typeof appRouter;
