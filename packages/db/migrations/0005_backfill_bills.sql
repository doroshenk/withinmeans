-- P2-01 backfill. DML only. Months opened before this release have no Bill rows (setup step 1 opens
-- the first month), so give each open month one Bill per recurring bill active in it. Closed months
-- are read-only. The rule matches billsForMonth in packages/domain.
INSERT INTO bills (
  household_id, ym, recurring_bill_id, name, category_id, due_date, estimate_cents, kind
)
SELECT
  m.household_id, m.ym, r.id, r.name, r.category_id,
  CAST(m.ym || '-' || lpad(CAST(r.due_day AS text), 2, '0') AS date),
  r.estimate_cents, 'recurring'
FROM months m
JOIN recurring_bills r ON r.household_id = m.household_id
WHERE m.status = 'open'
  AND r.start_ym <= m.ym
  AND (r.end_ym IS NULL OR m.ym <= r.end_ym)
ON CONFLICT (household_id, ym, recurring_bill_id) DO NOTHING;
