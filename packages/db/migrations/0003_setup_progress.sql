-- Setup wizard progress (spec §3, P1-08). DDL only. One row per household and step; a step with
-- no row is not finished yet. DSQL has no foreign keys, so household scoping lives in the repo.
CREATE TABLE IF NOT EXISTS setup_progress (
  household_id uuid NOT NULL,
  step integer NOT NULL CHECK (step BETWEEN 1 AND 9),
  status text NOT NULL CHECK (status IN ('done', 'skipped')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, step)
);
