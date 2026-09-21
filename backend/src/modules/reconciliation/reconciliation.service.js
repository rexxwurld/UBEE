// src/modules/reconciliation/reconciliation.service.js
const Wallet = require("../wallet/wallet.model");
const SettlementPool = require("../settlement/settlementPool.model");
const { computeBalance } = require("../ledger/ledger.service");
const { computePoolBalance } = require("../ledger/poolLedger.service");
const ReconciliationException = require("./reconciliationException.model");
const auditLog = require("../audit/auditLog.service");

// Upserts an open exception for this (type, entityRef) if the numbers
// still disagree - refreshing lastCheckedAt/checkCount rather than
// creating a duplicate row every run, per the unique partial index on
// the model. If an exception was previously open for this entity and
// the numbers now agree, auto-resolves it (self-healing - e.g. after a
// manual DB correction) rather than leaving a stale "open" exception
// that no longer reflects reality.
async function recordCheckResult({ type, entityType, entityRef, expectedBalance, actualBalance }) {
    const difference = actualBalance - expectedBalance;
    const inSync = difference === 0;

    const existingOpen = await ReconciliationException.findOne({ type, entityRef, status: "open" });

    if (inSync) {
        if (existingOpen) {
            existingOpen.status = "resolved";
            existingOpen.resolvedAt = new Date();
            existingOpen.resolvedBy = "reconciliation_job";
            existingOpen.resolutionNotes = "auto-resolved: balances agreed on a later reconciliation run";
            await existingOpen.save();

            await auditLog.record({
                actorType: "system",
                actorRef: "reconciliation_job",
                action: "reconciliation.exception_auto_resolved",
                entityType,
                entityRef,
                severity: "warning",
                metadata: { type }
            });
            return { status: "auto_resolved" };
        }
        return { status: "in_sync" };
    }

    // Mismatch - open or refresh an exception.
    if (existingOpen) {
        existingOpen.actualBalance = actualBalance;
        existingOpen.expectedBalance = expectedBalance;
        existingOpen.difference = difference;
        existingOpen.lastCheckedAt = new Date();
        existingOpen.checkCount += 1;
        await existingOpen.save();
        return { status: "still_open", checkCount: existingOpen.checkCount };
    }

    try {
        await ReconciliationException.create({
            type, entityType, entityRef, expectedBalance, actualBalance, difference
        });
    } catch (err) {
        // Race: another concurrent run (or a genuinely overlapping
        // scheduled+manual run) created it a moment ago - the unique
        // partial index catches this, nothing further to do.
        if (err.code !== 11000) throw err;
        return { status: "still_open_race" };
    }

    // A brand-new discrepancy, not a continuing one - this is the alert
    // the audit asked for ("no alerting on mismatch exists anywhere").
    await auditLog.record({
        actorType: "system",
        actorRef: "reconciliation_job",
        action: "reconciliation.exception_opened",
        entityType,
        entityRef,
        severity: "critical",
        metadata: { type, expectedBalance, actualBalance, difference }
    });
    return { status: "newly_opened" };
}

// Cursor-based, not Wallet.find({}) loaded all at once - this codebase
// has no scale/pagination infrastructure yet (Phase 9), and iterating
// every wallet on every run is already the honest, simple version of
// this; a real high-volume deployment should shard this by an
// updatedAt/id range or move it to a proper batch job, not run every
// wallet in one process on a fixed interval.
async function reconcileWallets() {
    const cursor = Wallet.find({}).cursor();
    let checked = 0;
    let opened = 0;
    let resolved = 0;

    for await (const wallet of cursor) {
        const expectedBalance = await computeBalance(wallet._id);
        const result = await recordCheckResult({
            type: "wallet_ledger_mismatch",
            entityType: "Wallet",
            entityRef: wallet._id.toString(),
            expectedBalance,
            actualBalance: wallet.balance
        });
        checked++;
        if (result.status === "newly_opened") opened++;
        if (result.status === "auto_resolved") resolved++;
    }

    return { checked, opened, resolved };
}

async function reconcilePools() {
    const pools = await SettlementPool.find({});
    let checked = 0;
    let opened = 0;
    let resolved = 0;

    for (const pool of pools) {
        // Check 1: pool's own ledger vs its cached poolBalance.
        const ledgerBalance = await computePoolBalance(pool._id);
        const ledgerResult = await recordCheckResult({
            type: "pool_ledger_mismatch",
            entityType: "SettlementPool",
            entityRef: pool._id.toString(),
            expectedBalance: ledgerBalance,
            actualBalance: pool.poolBalance
        });
        checked++;
        if (ledgerResult.status === "newly_opened") opened++;
        if (ledgerResult.status === "auto_resolved") resolved++;

        // Check 2: sum of this pool's linked wallets vs the pool's
        // cached poolBalance - a different invariant than check 1 (this
        // one catches drift between "what the wallets think they hold"
        // and "what the pool thinks it's backing", independent of
        // whether either side's OWN ledger is internally consistent).
        // Same comparison admin.service.js:getPoolStatus already made
        // available on-demand - this makes it automatic and alerting.
        const wallets = await Wallet.find({ pool: pool._id });
        const walletSum = wallets.reduce((sum, w) => sum + w.balance, 0);
        const sumResult = await recordCheckResult({
            type: "pool_wallet_sum_mismatch",
            entityType: "SettlementPool",
            entityRef: pool._id.toString(),
            expectedBalance: pool.poolBalance,
            actualBalance: walletSum
        });
        checked++;
        if (sumResult.status === "newly_opened") opened++;
        if (sumResult.status === "auto_resolved") resolved++;
    }

    return { checked, opened, resolved };
}

async function listExceptions({ status = "open" } = {}) {
    return ReconciliationException.find({ status }).sort({ firstDetectedAt: 1 });
}

async function resolveException(id, { performedBy, notes }) {
    const exception = await ReconciliationException.findById(id);
    if (!exception) throw new Error("exception_not_found");
    if (exception.status !== "open") throw new Error("exception_not_open");
    if (!notes || !notes.trim()) throw new Error("resolution_notes_required");

    exception.status = "resolved";
    exception.resolvedAt = new Date();
    exception.resolvedBy = performedBy;
    exception.resolutionNotes = notes;
    await exception.save();

    await auditLog.record({
        actorType: "admin",
        actorRef: performedBy,
        action: "reconciliation.exception_manually_resolved",
        entityType: exception.entityType,
        entityRef: exception.entityRef,
        severity: "warning",
        metadata: { type: exception.type, notes }
    });

    return exception;
}

module.exports = { reconcileWallets, reconcilePools, listExceptions, resolveException };
