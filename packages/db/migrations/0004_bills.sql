-- One row per bill per month (spec §4, P2-01). DDL only. openMonth creates a row for each active
-- recurring bill; one-time bills have no recurring_bill_id. The unique key keeps a recurring bill to
-- one row a month (NULLs are distinct, so one-time bills are not limited), and its index serves the
-- "this household, this month" queries. DSQL has no foreign keys: scoping lives in the repo layer.
CREATE TABLE IF NOT EXISTS bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL,
  ym text NOT NULL CHECK (ym ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  recurring_bill_id uuid,
  name text NOT NULL,
  category_id uuid NOT NULL,
  due_date date NOT NULL,
  estimate_cents bigint,
  actual_cents bigint,
  paid_at timestamptz,
  kind text NOT NULL CHECK (kind IN ('recurring', 'one_time')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (household_id, ym, recurring_bill_id)
);
