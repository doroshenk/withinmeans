import { initTRPC, TRPCError } from '@trpc/server';
import {
  acceptInviteInput,
  addAccountInput,
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
import type { Context } from './context.js';
import { firstMonthOptions, startFirstMonth } from './firstMonth.js';
import { invitePartner, resendInvite } from './invitePartner.js';
import {
  addSetupAccount,
  listSetupAccounts,
  removeSetupAccount,
  saveCushion,
} from './setupAccounts.js';
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

  /** Spec §3 step 4 / T18: bills move to the first remaining category. */
  deleteCategory: writeProcedure
    .input(deleteCategoryInput)
    .mutation(({ ctx, input }) => deleteCategory(ctx, input)),

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
