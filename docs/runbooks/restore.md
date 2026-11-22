# Restore runbook (Aurora DSQL)

Last drill: 2026-11-22, on dev (restore into a new cluster, row checked, restored cluster deleted).

## What is backed up

- AWS Backup takes a recovery point of each stage's DSQL cluster **daily at 05:00 UTC** and keeps it
  **14 days**. Prod also gets an on-demand recovery point before every migration
  (`scripts/backup-now.sh prod`). ADR 0014.
- Recovery points live in the stage's **backup vault**. The names are the `BackupVaultName` output
  of `DataStack-<stage>`.
- A backup is never restored over the live cluster. You restore into a **new** cluster, check it,
  then point the app at it or copy rows back (see "After the restore").

## Find things in the console (region us-east-2)

- **AWS Backup → Backup plans**: the plan and its daily rule.
- **AWS Backup → Vaults**: the vault and its recovery points (resource type: Aurora DSQL).
- **AWS Backup → Jobs**: backup jobs (each run) and restore jobs.
- **Aurora DSQL → Clusters**: the live cluster and any restored one.

## Take a backup now (optional)

```bash
scripts/backup-now.sh dev   # waits until the job is COMPLETED
```

## Restore into a new cluster

1. AWS Backup → Vaults → the stage's vault → pick a recovery point → **Restore**.
2. Choose a restore into a new cluster. Use the backup role from the `BackupRoleArn` output if asked
   for a role.
3. Wait until the restore job (AWS Backup → Jobs → Restore jobs) shows **Completed**.
4. Aurora DSQL → Clusters: the new cluster appears. Note its endpoint.

CLI equivalent (confirm the metadata keys with `aws backup get-restore-job-metadata
--recovery-point-arn <arn>` during the drill):

```bash
aws backup start-restore-job --region us-east-2 --recovery-point-arn <arn> \
  --iam-role-arn <BackupRoleArn> --metadata '<from get-restore-job-metadata>'
```

## Check it

Connect to the restored cluster's endpoint (the same way `pnpm migrate` does, with an IAM token
for that endpoint) and run `select count(*) from households;`. The count should match the live
cluster at the time of the recovery point. Never paste real data into issues or PRs.

## Clean up the drill

Delete the restored cluster (Aurora DSQL → Clusters → select → Delete). It was created outside
CloudFormation, so the stack knows nothing about it. Production clusters have deletion protection,
which has to be switched off first.

## After a real restore

Decide with the owner: point the stage's configuration at the restored endpoint, or copy rows
back. Do not delete the original cluster until the restored one has been checked.

## Tearing down dev

The dev backup vault is deleted with its stack, but AWS refuses to delete a vault that still holds
recovery points. Delete the recovery points first (AWS Backup → Vaults → select → Delete), or wait
for the 14 days to pass.
