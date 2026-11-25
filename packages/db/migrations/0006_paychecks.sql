-- Pay schedules and the paychecks they make (spec §4, §5.9, P2-03). DDL only. openMonth creates a
-- paycheck for each expected payday; its month is the month of expected_date. The unique key keeps
-- a schedule to one paycheck a date. semimonthly_day_1/2 are null unless the schedule is
-- semimonthly. DSQL has no foreign keys: scoping lives in the repo layer.
CREATE TABLE IF NOT EXISTS pay_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL,
  name text NOT NULL,
  frequency text NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'semimonthly', 'monthly')),
  anchor_date date NOT NULL,
  semimonthly_day_1 integer CHECK (semimonthly_day_1 BETWEEN 1 AND 31),
  semimonthly_day_2 integer CHECK (semimonthly_day_2 BETWEEN 1 AND 31),
  usual_cents bigint NOT NULL CHECK (usual_cents > 0),
  account_id uuid,
  ended_on date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS paychecks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL,
  schedule_id uuid NOT NULL,
  expected_date date NOT NULL,
  expected_cents bigint NOT NULL,
  received_date date,
  received_cents bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((received_date IS NULL) = (received_cents IS NULL)),
  UNIQUE (schedule_id, expected_date)
);
