#!/usr/bin/env bash
# One-time (and safe to re-run) production hardening for Qrave. Run by a project OWNER:
#   PROJECT=reva-nest-foodcourt ALERT_EMAIL=you@example.com bash scripts/ops/harden-infra.sh
# It turns on: 7-day point-in-time recovery, daily + weekly backups, delete protection on the database,
# and log-based alerts for the things that mean money or orders are at risk. Nothing here deletes data.
set -euo pipefail
PROJECT="${PROJECT:?set PROJECT}"; EMAIL="${ALERT_EMAIL:?set ALERT_EMAIL}"; DB="${DB:-default}"
g() { echo "+ $*"; "$@"; }

echo "== 1. Point-in-time recovery (7 days) and delete protection"
g gcloud firestore databases update --database="$DB" --project="$PROJECT" --enable-pitr --delete-protection

echo "== 2. Scheduled backups (kept after the database is gone): daily 7 days, weekly 14 weeks"
existing="$(gcloud firestore backups schedules list --database="$DB" --project="$PROJECT" --format='value(name)' || true)"
if [ -z "$existing" ]; then
  g gcloud firestore backups schedules create --database="$DB" --project="$PROJECT" --recurrence=daily --retention=7d
  g gcloud firestore backups schedules create --database="$DB" --project="$PROJECT" --recurrence=weekly --day-of-week=SUN --retention=14w
else echo "schedules already exist:"; echo "$existing"; fi

echo "== 3. Alert channel"
chan="$(gcloud alpha monitoring channels list --project="$PROJECT" --filter="labels.email_address=$EMAIL" --format='value(name)' | head -1)"
[ -n "$chan" ] || chan="$(gcloud alpha monitoring channels create --project="$PROJECT" --display-name="Qrave on-call" --type=email --channel-labels="email_address=$EMAIL" --format='value(name)')"

echo "== 4. Log-based metrics and alert policies"
metric() { # name, filter
  gcloud logging metrics describe "$1" --project="$PROJECT" >/dev/null 2>&1 || g gcloud logging metrics create "$1" --project="$PROJECT" --description="$1" --log-filter="$2"
}
policy() { # display name, metric
  local f; f="$(mktemp)"
  cat >"$f" <<JSON
{"displayName":"$1","combiner":"OR","notificationChannels":["$chan"],
 "conditions":[{"displayName":"$1","conditionThreshold":{"filter":"metric.type=\"logging.googleapis.com/user/$2\" resource.type=\"cloud_function\"",
 "comparison":"COMPARISON_GT","thresholdValue":0,"duration":"0s","aggregations":[{"alignmentPeriod":"300s","perSeriesAligner":"ALIGN_SUM"}]}}]}
JSON
  gcloud alpha monitoring policies list --project="$PROJECT" --filter="displayName=\"$1\"" --format='value(name)' | grep -q . || g gcloud alpha monitoring policies create --project="$PROJECT" --policy-from-file="$f"
}
metric qrave_webhook_failures 'resource.type="cloud_run_revision" AND jsonPayload.message:"Webhook handling failed"'
metric qrave_bad_signatures   'resource.type="cloud_run_revision" AND jsonPayload.message:"Rejected unsigned or badly signed webhook"'
metric qrave_amount_mismatch  'resource.type="cloud_run_revision" AND jsonPayload.message:"Payment amount mismatch"'
metric qrave_reconcile_diff   'resource.type="cloud_run_revision" AND jsonPayload.message:"Reconciliation found differences"'
metric qrave_razorpay_down    'resource.type="cloud_run_revision" AND jsonPayload.message:"Razorpay order creation failed"'
metric qrave_checkout_errors  'resource.type="cloud_run_revision" AND resource.labels.service_name="createcheckout" AND severity>=ERROR'
for m in webhook_failures amount_mismatch reconcile_diff razorpay_down checkout_errors; do policy "Qrave: $m" "qrave_$m"; done

echo "== Verify"
g gcloud firestore databases describe --database="$DB" --project="$PROJECT" --format='value(pointInTimeRecoveryEnablement,deleteProtectionState)'
g gcloud firestore backups schedules list --database="$DB" --project="$PROJECT"
echo "Done. Now do the restore drill in docs/runbook.md section 8; a backup you have not restored is not a backup."
