#!/usr/bin/env bash
# Takes an on-demand AWS Backup recovery point of one stage's DSQL cluster and waits for it.
# The prod deploy runs this before migrations (ADR 0014). Usage: scripts/backup-now.sh dev|prod
# Needs AWS credentials for the account and these CloudFormation outputs on DataStack-<stage>.
set -euo pipefail
# Started from PowerShell, Git Bash may not have its own tools (sleep) on PATH.
PATH="/usr/bin:$PATH"

stage="${1:?usage: backup-now.sh dev|prod}"
case "$stage" in dev | prod) ;; *) echo "stage must be dev or prod" >&2; exit 2 ;; esac
stack="DataStack-$stage"
region="us-east-2"

out() {
  aws cloudformation describe-stacks --region "$region" --stack-name "$stack" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
}
need() {
  local value
  value="$(out "$1")"
  if [ -z "$value" ] || [ "$value" = "None" ]; then
    echo "Output $1 not found on $stack (deploy the stack first)" >&2
    exit 1
  fi
  echo "$value"
}
vault="$(need BackupVaultName)"
cluster_arn="$(need ClusterArn)"
role_arn="$(need BackupRoleArn)"

job="$(aws backup start-backup-job --region "$region" --backup-vault-name "$vault" \
  --resource-arn "$cluster_arn" --iam-role-arn "$role_arn" --query BackupJobId --output text)"
echo "Started backup job $job"

# Give up after 60 minutes so a stuck job can't hang a deploy forever.
for _ in $(seq 1 240); do
  state="$(aws backup describe-backup-job --region "$region" --backup-job-id "$job" \
    --query State --output text)"
  case "$state" in
    COMPLETED) echo "Backup completed"; exit 0 ;;
    ABORTED | FAILED | EXPIRED) echo "Backup job ended as $state" >&2; exit 1 ;;
    *) echo "State: $state"; sleep 15 ;;
  esac
done
echo "Gave up waiting for backup job $job after 60 minutes" >&2
exit 1
