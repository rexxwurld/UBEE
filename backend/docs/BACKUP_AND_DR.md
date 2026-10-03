# Backup, Restore & Disaster Recovery

The original audit found this undocumented anywhere in the repository
(§16: "no backup cadence, no restore runbook, no stated RPO/RTO"). This
file is that documentation. It does not claim disaster recovery is
"solved" - it states what's actually in place, what the real targets
are, and what's still missing, honestly.

## Stated targets

These are **targets to design toward and operationally commit to**, not
a claim that they're currently met end-to-end - actually meeting them
depends on your database hosting choice (below) and on someone actually
running the drill in "Restore verification," which has not been
exercised as part of this work.

- **RPO (Recovery Point Objective): 5 minutes.** For a payments backend,
  losing more than a few minutes of transaction history is not
  acceptable - this requires continuous/oplog-based backup (see below),
  not periodic snapshots alone.
- **RTO (Recovery Time Objective): 1 hour** to restore database
  service from a verified backup, for a single-region outage/corruption
  event. Does not cover a full regional cloud-provider outage, which
  would need a documented multi-region failover plan this document does
  not attempt to specify.

## Database backups (MongoDB)

**This codebase requires a replica set** (multi-document transactions
are used everywhere money moves - see `.env.example`'s comment on
`MONGO_URI`), which affects backup strategy: a replica set gives you
built-in redundancy (a secondary can be promoted if the primary fails)
*and* is a prerequisite for point-in-time / continuous backup via the
oplog.

**Recommended (production): MongoDB Atlas continuous backup**, or
equivalent continuous/oplog-based backup if self-hosting. Gives
point-in-time restore to any moment within the retention window, which
is what actually delivers a 5-minute RPO for a system with this write
volume. Configure:
- Continuous backup enabled, not just scheduled snapshots.
- Retention: minimum 30 days point-in-time, plus weekly snapshots
  retained 12 months (adjust to your actual regulatory record-retention
  requirement once that's confirmed - see the audit's §6 note that
  retention policy is a compliance decision, not a technical default).

**If self-hosting instead of using a managed provider:**
```
mongodump --uri="$MONGO_URI" --oplog --out=/backups/$(date +%Y%m%d-%H%M%S)
```
`--oplog` captures oplog entries during the dump so the result is
consistent as of dump-completion time even under concurrent writes -
without it, a dump taken while the app is live can be internally
inconsistent. Run this on a schedule (cron/systemd timer) AND ship the
resulting files off the database host immediately (S3/equivalent) - a
backup stored only on the same host as the database it's backing up is
not a real backup.

## What backups do NOT cover

- **`FIELD_ENCRYPTION_KEY`** (src/utils/fieldEncryption.js) - BVN/NIN
  are encrypted at rest with this key. If it's lost, every encrypted
  BVN/NIN in every backup is unrecoverable, even though the backup
  itself restores fine. This key needs its OWN backup/escrow procedure
  (a secrets manager with its own durability guarantees - AWS Secrets
  Manager, HashiCorp Vault, etc.) independent of the database backup
  strategy above. Losing it is a silent, delayed-discovery failure mode:
  everything looks fine until someone needs to decrypt a record.
- **`ADMIN_JWT_SECRET` / `JWT_SECRET` / `SWIFTPAY_WEBHOOK_SECRET` /
  partner webhook secrets** (`Partner.webhookSecret` in the database
  IS covered by the DB backup above, but the app's own env-level
  secrets are not, unless your secrets manager is itself backed up).
- **Application code and configuration** - covered by git, not by any
  of the above. Confirm your git remote itself has redundancy (GitHub/
  GitLab's own durability, or a mirror) rather than assuming a single
  developer's local clone is sufficient.

## Restore procedure (self-hosted mongodump/mongorestore path)

```
mongorestore --uri="$MONGO_URI" --drop /backups/<snapshot-dir>
```
`--drop` replaces existing collections rather than merging - correct
for a full disaster-recovery restore, wrong if you ever want to restore
a backup alongside live data for investigation (omit `--drop` and
restore into a differently-named database instead for that case).

If using Atlas or another managed provider's continuous backup, restore
through that provider's point-in-time restore UI/API instead - it
handles replica-set-consistent restoration correctly, which a manual
mongorestore of a point-in-time snapshot may not if done incorrectly.

## Restore verification

**Not yet exercised.** A backup that has never been restored and
verified is not a tested backup, only an assumed one. Before relying on
this for a real-money launch:
1. Restore a recent backup into a separate, non-production environment.
2. Run the reconciliation job (`src/jobs/reconciliation.job.js`) against
   the restored data and confirm it reports no exceptions - this is a
   real, existing tool that can validate restore integrity, not just a
   manual eyeball check.
3. Spot-check that `LedgerEntry` counts and a sample of computed
   balances match what was true at backup time.
4. Time the whole restore, end-to-end, against the stated 1-hour RTO
   above - if it doesn't fit, the RTO target or the backup strategy
   needs to change, not just this document's claim about it.

Do this on a recurring schedule (quarterly, at minimum) once real
customer data exists - a restore procedure that worked once when it was
written can silently stop working as the dataset grows or the schema
changes.

## Application-level reliability (not a backup, but related)

Two things already built (Phases 2 and 6) reduce how much a
database-level incident can hurt, independent of backups:
- **`src/jobs/recoverStuckTransfers.job.js`** - after any outage/crash,
  running this resolves payouts/refunds that were mid-flight when
  things went down, rather than leaving them stuck.
- **`src/jobs/reconciliation.job.js`** - run this after ANY restore or
  suspected data-loss event, not just on its normal schedule, to
  surface anywhere the restored state disagrees with itself.

## What's still genuinely missing

Being honest about the gap, not just describing the target:
- No infrastructure-as-code for provisioning a real production replica
  set or Atlas cluster - this document describes what to configure
  manually.
- No automated, scheduled execution of "Restore verification" above -
  it's a documented manual procedure, not a running job.
- No multi-region failover plan for a full regional outage.
- No documented incident-response runbook for who does what during an
  actual outage (this file covers the database/data side only).
