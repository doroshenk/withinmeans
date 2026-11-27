-- Each month's card statement has its own due date (spec §4, §5.10, P2-14). DDL only.
-- Null means the card's due day in that month, so earlier rows need no change.
ALTER TABLE card_statements ADD COLUMN IF NOT EXISTS due_date date;
