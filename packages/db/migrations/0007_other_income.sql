-- One-time income (spec §4, P2-04). DDL only. An entry counts in the month of its date, whether or
-- not that month is open. account_id is null when the household had no checking account to default
-- to. DSQL has no foreign keys: scoping lives in the repo layer.
CREATE TABLE IF NOT EXISTS other_income (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL,
  date date NOT NULL,
  source text NOT NULL,
  type text NOT NULL CHECK (type IN ('side_work', 'sale', 'refund', 'gift', 'bonus', 'other')),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  account_id uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
