-- Credit cards and their monthly statements (spec §4, §5.10, P2-07). DDL only. Only a nickname is
-- kept: never a card number. A card has one statement a month; no row means no balance entered.
-- DSQL has no foreign keys: scoping lives in the repo layer.
CREATE TABLE IF NOT EXISTS credit_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL,
  nickname text NOT NULL,
  due_day integer NOT NULL CHECK (due_day BETWEEN 1 AND 31),
  usual_plan text NOT NULL CHECK (usual_plan IN ('full', 'min', 'varies')),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS card_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL,
  card_id uuid NOT NULL,
  ym text NOT NULL CHECK (ym ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  statement_cents bigint NOT NULL CHECK (statement_cents >= 0),
  minimum_cents bigint NOT NULL CHECK (minimum_cents >= 0),
  planned_payment_cents bigint NOT NULL CHECK (planned_payment_cents >= 0),
  paid_cents bigint CHECK (paid_cents >= 0),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (minimum_cents <= statement_cents),
  CHECK (planned_payment_cents <= statement_cents),
  CHECK ((paid_at IS NULL) = (paid_cents IS NULL)),
  UNIQUE (card_id, ym)
);
