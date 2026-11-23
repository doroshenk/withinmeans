-- Core household tables (spec §4). DDL only. DSQL has no foreign keys, so household scoping and
-- referential checks live in the repository layer. Constraints are declared inside CREATE TABLE
-- (DSQL builds other indexes with CREATE INDEX ASYNC; these tables are small, so none are added yet).
CREATE TABLE IF NOT EXISTS invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('full', 'view')),
  note text NOT NULL DEFAULT '',
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  invited_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS months (
  household_id uuid NOT NULL,
  ym text NOT NULL CHECK (ym ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  started_at timestamptz NOT NULL,
  closed_at timestamptz,
  PRIMARY KEY (household_id, ym)
);

-- name_key is the lower-cased, trimmed name: DSQL has no expression indexes, so case-insensitive
-- uniqueness is a plain unique constraint on this column.
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL,
  name text NOT NULL,
  name_key text NOT NULL,
  color_index integer NOT NULL DEFAULT 0,
  sort integer NOT NULL DEFAULT 0,
  archived_at timestamptz,
  UNIQUE (household_id, name_key)
);

CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('checking', 'savings', 'cash', 'brokerage')),
  is_primary_checking boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE TABLE IF NOT EXISTS balance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL,
  account_id uuid NOT NULL,
  date date NOT NULL,
  balance_cents bigint NOT NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recurring_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL,
  name text NOT NULL,
  estimate_cents bigint NOT NULL,
  due_day integer NOT NULL CHECK (due_day BETWEEN 1 AND 28),
  category_id uuid NOT NULL,
  autopay boolean NOT NULL DEFAULT false,
  account_id uuid,
  start_ym text NOT NULL CHECK (start_ym ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  end_ym text CHECK (end_ym ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
