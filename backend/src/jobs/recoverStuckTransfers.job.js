// src/jobs/recoverStuckTransfers.job.js
//
// There is no queue/worker infrastructure in this project yet (Phase 9
// of the roadmap). This is a deliberately small, dependency-free
// stand-in for one specific reliability gap identified in the audit:
//
//   payout.service.js / refund.service.js debit the settlement pool
//   and commit that inside a DB transaction BEFORE calling out to the
//   bank provider. If the process crashes, loses network, or is killed
//   between that commit and the provider call resolving, the record is
//   left at status "pending" (or, for refunds, sometimes "processing")
//   forever, with pool funds already gone and nothing watching it.
//
// PHASE 5 UPDATE: this job now ACTUALLY TRIES to resolve a stuck
// transfer, by asking the active provider (src/providers/) for its
// status via checkTransferStatus - queried by the client-side
// `reference` (the payout/refund's own _id) since a crash before the
// provider ever responded means there may be no providerReference on
// file to look up by. If the provider can answer definitively
// ("success" or "failed"), this job completes the guarded transition
// itself - crediting/debiting the ledger exactly the same way the
// original processPayout/processRefund call would have. Only when the
// provider genuinely doesn't know (status: "unknown", including every
// provider that doesn't support status checks at all, like the mock
// provider) does this fall back to flagging "requires_review" for a
// human, same as before this update.
//
// Deliberately NOT a blind retry of initiateTransfer - retrying a
// transfer whose outcome is unknown risks a double-send the moment a
// real provider is connected. Every write here is a status-guarded
// conditional update, never a blind overwrite.

const mongoose = require("mongoose");
const Payout = require("../modules/payout/payout.model");
const Refund = require("../modules/refund/refund.model");
const SettlementPool = require("../modules/settlement/settlementPool.model");
const { postPoolEntry } = require("../modules/ledger/poolLedger.service");
const { creditPool } = require("../modules/settlement/settlementPool.service");
const auditLog = require("../modules/audit/auditLog.service");
const { getActiveProvider } = require("../providers");

const STALE_THRESHOLD_MS = Number(process.env.STUCK_TRANSFER_THRESHOLD_MS || 10 * 60 * 1000); // 10 min default

async function checkStatusSafely(reference, providerReference) {
    try {
        return await getActiveProvider().checkTransferStatus({ reference, providerReference });
    } catch (err) {
        return { status: "unknown", error: err.message };
    }
}

async function resolvePayoutAsSuccess(payout, providerStatus) {
    const updated = await Payout.findOneAndUpdate(
        { _id: payout._id, status: "pending" },
        { $set: { status: "success" } },
        { new: true }
    );
    if (!updated) return false;

    await auditLog.record({
        actorType: "system",
        actorRef: "recovery_job",
        action: "payout.resolved_success_via_provider_status_check",
        entityType: "Payout",
        entityRef: payout._id.toString(),
        severity: "warning",
        metadata: { providerStatus }
    });
    return true;
}

async function resolvePayoutAsFailed(payout, providerStatus) {
    // Pool funds were debited when the payout was created - if the
    // provider now confirms it failed, credit them back, same ledger
    // pattern as reversePayout() in payout.service.js.
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const updated = await Payout.findOneAndUpdate(
            { _id: payout._id, status: "pending" },
            { $set: { status: "failed", failureReason: "provider_confirmed_failed_via_status_check" } },
            { new: true, session }
        );
        if (!updated) {
            await session.abortTransaction();
            session.endSession();
            return false;
        }

        await postPoolEntry({
            pool: payout.pool,
            direction: "credit",
            amount: payout.amount,
            sourceType: "reversal",
            sourceRef: `${payout._id.toString()}_recovery_reversal`,
            description: "Payout reversal via recovery job provider status check",
            session
        });
        await creditPool(payout.pool, payout.amount, session);

        await session.commitTransaction();
        session.endSession();

        await auditLog.record({
            actorType: "system",
            actorRef: "recovery_job",
            action: "payout.resolved_failed_via_provider_status_check",
            entityType: "Payout",
            entityRef: payout._id.toString(),
            severity: "warning",
            metadata: { providerStatus }
        });
        return true;
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
}

async function flagPayoutForReview(payout) {
    const updated = await Payout.findOneAndUpdate(
        { _id: payout._id, status: "pending" },
        { $set: { status: "requires_review" } },
        { new: true }
    );
    if (!updated) return false;

    await auditLog.record({
        actorType: "system",
        actorRef: "recovery_job",
        action: "payout.flagged_requires_review",
        entityType: "Payout",
        entityRef: payout._id.toString(),
        severity: "critical",
        metadata: {
            amount: payout.amount,
            destinationAccountNumber: payout.destinationAccountNumber,
            createdAt: payout.createdAt,
            reason: "stuck_at_pending_past_threshold_provider_status_unknown"
        }
    });
    return true;
}

async function resolveStuckPayouts(cutoff) {
    const stuck = await Payout.find({ status: "pending", createdAt: { $lt: cutoff } });

    let resolved = 0;
    let flagged = 0;

    for (const payout of stuck) {
        const result = await checkStatusSafely(payout._id.toString(), payout.providerReference);

        if (result.status === "success") {
            if (await resolvePayoutAsSuccess(payout, result)) resolved++;
        } else if (result.status === "failed") {
            if (await resolvePayoutAsFailed(payout, result)) resolved++;
        } else {
            if (await flagPayoutForReview(payout)) flagged++;
        }
    }
    return { resolved, flagged };
}

async function resolveRefundAsSuccess(refund, providerStatus) {
    const updated = await Refund.findOneAndUpdate(
        { _id: refund._id, status: { $in: ["pending", "processing"] } },
        { $set: { status: "successful" } },
        { new: true }
    );
    if (!updated) return false;

    await auditLog.record({
        actorType: "system",
        actorRef: "recovery_job",
        action: "refund.resolved_successful_via_provider_status_check",
        entityType: "Refund",
        entityRef: refund._id.toString(),
        severity: "warning",
        metadata: { providerStatus }
    });
    return true;
}

async function resolveRefundAsFailed(refund, providerStatus) {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const updated = await Refund.findOneAndUpdate(
            { _id: refund._id, status: { $in: ["pending", "processing"] } },
            { $set: { status: "failed", failureReason: "provider_confirmed_failed_via_status_check", reversedAt: new Date() } },
            { new: true, session }
        );
        if (!updated) {
            await session.abortTransaction();
            session.endSession();
            return false;
        }

        await postPoolEntry({
            pool: refund.pool,
            direction: "credit",
            amount: refund.amount,
            sourceType: "reversal",
            sourceRef: `${refund._id.toString()}_recovery_reversal`,
            description: "Refund reversal via recovery job provider status check",
            session
        });
        await creditPool(refund.pool, refund.amount, session);

        await session.commitTransaction();
        session.endSession();

        await auditLog.record({
            actorType: "system",
            actorRef: "recovery_job",
            action: "refund.resolved_failed_via_provider_status_check",
            entityType: "Refund",
            entityRef: refund._id.toString(),
            severity: "warning",
            metadata: { providerStatus }
        });
        return true;
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
}

async function flagRefundForReview(refund) {
    const updated = await Refund.findOneAndUpdate(
        { _id: refund._id, status: refund.status },
        { $set: { status: "requires_review" } },
        { new: true }
    );
    if (!updated) return false;

    await auditLog.record({
        actorType: "system",
        actorRef: "recovery_job",
        action: "refund.flagged_requires_review",
        entityType: "Refund",
        entityRef: refund._id.toString(),
        severity: "critical",
        metadata: {
            amount: refund.amount,
            destinationAccountNumber: refund.destinationAccountNumber,
            previousStatus: refund.status,
            createdAt: refund.createdAt,
            reason: "stuck_past_threshold_provider_status_unknown"
        }
    });
    return true;
}

async function resolveStuckRefunds(cutoff) {
    const stuck = await Refund.find({
        status: { $in: ["pending", "processing"] },
        createdAt: { $lt: cutoff }
    });

    let resolved = 0;
    let flagged = 0;

    for (const refund of stuck) {
        const result = await checkStatusSafely(refund._id.toString(), refund.providerRef);

        if (result.status === "success") {
            if (await resolveRefundAsSuccess(refund, result)) resolved++;
        } else if (result.status === "failed") {
            if (await resolveRefundAsFailed(refund, result)) resolved++;
        } else {
            if (await flagRefundForReview(refund)) flagged++;
        }
    }
    return { resolved, flagged };
}

// Runs one pass. Safe to call repeatedly/concurrently - every write is
// a status-guarded conditional update, never a blind overwrite.
async function runOnce() {
    const cutoff = new Date(Date.now() - STALE_THRESHOLD_MS);
    const [payoutResult, refundResult] = await Promise.all([
        resolveStuckPayouts(cutoff),
        resolveStuckRefunds(cutoff)
    ]);

    const totalResolved = payoutResult.resolved + refundResult.resolved;
    const totalFlagged = payoutResult.flagged + refundResult.flagged;
    if (totalResolved || totalFlagged) {
        console.log(
            `[recovery_job] resolved ${totalResolved} transfer(s) via provider status check, ` +
            `flagged ${totalFlagged} as requires_review (payouts: ${JSON.stringify(payoutResult)}, refunds: ${JSON.stringify(refundResult)})`
        );
    }
    return { payoutResult, refundResult };
}

// Opt-in only - NOT started automatically by server.js. Set
// RUN_RECOVERY_JOB=true (and optionally RECOVERY_JOB_INTERVAL_MS) to
// enable it for a given process. Kept opt-in deliberately: running two
// instances of this app (e.g. behind a load balancer) with the job
// auto-started in every process just means redundant, harmless-but-
// wasteful passes - opt-in makes that an explicit choice, not a
// surprise, and makes it obvious this still needs a real
// single-instance job runner (Phase 9) rather than being treated as
// "solved."
function startScheduler(intervalMs = Number(process.env.RECOVERY_JOB_INTERVAL_MS || 5 * 60 * 1000)) {
    runOnce().catch((err) => console.error("[recovery_job] run failed:", err.message));
    return setInterval(() => {
        runOnce().catch((err) => console.error("[recovery_job] run failed:", err.message));
    }, intervalMs);
}

module.exports = { runOnce, startScheduler, STALE_THRESHOLD_MS };
