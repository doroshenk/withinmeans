import type { BillsPageClient } from '../../pages/bills/types';
import type { PaychecksPageClient } from '../../pages/paychecks/types';

/** The calls Quick Add makes: each page's own, so both save the same record. */
export type QuickAddClient = Pick<
  BillsPageClient,
  'billsPage' | 'addBill' | 'removeBill' | 'saveCardStatement'
> &
  Pick<
    PaychecksPageClient,
    | 'paychecksPage'
    | 'markPaycheckReceived'
    | 'unmarkPaycheckReceived'
    | 'otherIncome'
    | 'addOtherIncome'
    | 'removeOtherIncome'
  >;
