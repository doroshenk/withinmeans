-- Core tenancy tables (spec §4). DDL only. DSQL has no foreign keys or sequences:
-- ids are UUIDs and household scoping is enforced in the repository layer.
CREATE TABLE households (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('solo', 'duo')),
  timezone text NOT NULL,
  cushion_cents bigint NOT NULL DEFAULT 0,
  first_month text NOT NULL CHECK (first_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  cognito_sub text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  household_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'full', 'view')),
  PRIMARY KEY (household_id, user_id)
);