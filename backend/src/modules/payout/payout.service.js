// src/modules/payout/payout.service.js
//
// Receives a payout instruction from a partner and moves real funds out
// of the settlement pool. The actual "send money to destination bank"
// step goes through the pluggable provider interface (Phase 5 prep -
// see src/providers/) - swap BANK_PROVIDER in the environment to
// connect a real banking rail; this file doesn't change.

const mongoose = require("mongoose");
const Payout = require("./payout.model");
const SettlementPool = require("../settlement/settlementPool.model");
const { postPoolEntry } = require("../ledger/poolLedger.service");
const { getPoolByService, debitPool, creditPool } = require("../settlement/settlementPool.service");
const auditLog = require("../audit/auditLog.service");
const { getActiveProvider } = require("../../providers");

async function processPayout({
    idempotencyKey,
    linkedService,
    destinationAccountNumber,
    destinationBank,
    destinationAccountName = "",
    amount
}) {
    amount = Number(amount);

    if (!idempotencyKey) throw new Error("idempotencyKey_required");
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("invalid_payout_amount");
    if (!destinationAccountNumber || !destinationBank) throw new Error("destination_required");

    const existing = await Payout.findOne({ idempotencyKey });
    if (existing) return { duplicate: true, payout: existing };

    const pool = await getPoolByService(linkedService);
    if (!pool) throw new Error("settlement_pool_not_found");

    const session = await mongoose.startSession();
    let payout;

    try {
        session.startTransaction();

        // Payouts draw against the POOL's aggregate balance - the real
        // money backing every virtual account together - not any single
        // customer's account. Checking one wallet's balance here was the
        // bug: money can be sitting fine in the pool via other virtual
        // accounts while one arbitrary wallet sits empty.
        const freshPool = await SettlementPool.findById(pool._id).session(session);
        if (freshPool.poolBalance < amount) {
            throw new Error("insufficient_pool_funds");
        }

        [payout] = await Payout.create(
            [{
                idempotencyKey,
                pool: pool._id,
                destinationAccountNumber,
                destinationBank,
                destinationAccountName,
                amount,
                status: "pending"
            }],
            { session, ordered: true }
        );

        await postPoolEntry({
            pool: pool._id,
            direction: "debit",
            amount,
            sourceType: "payout",
            sourceRef: payout._id.toString(),
            description: `Payout to ${destinationAccountNumber}`,
            session
        });
        await debitPool(pool._id, amount, session);

        await session.commitTransaction();
        session.endSession();

    } catch (err) {
        await session.abortTransaction();
        session.endSession();

        if (err.code === 11000) {
            const raced = await Payout.findOne({ idempotencyKey });
            if (raced) return { duplicate: true, payout: raced };
        }
        throw err;
    }

    let providerResult;
    try {
        providerResult = await getActiveProvider().initiateTransfer({
            amount,
            destinationAccountNumber: payout.destinationAccountNumber,
            destinationBankCode: payout.destinationBank,
            destinationAccountName: payout.destinationAccountName,
            reference: payout._id.toString(),
            narration: `Payout ${payout._id.toString()}`
        });
    } catch (err) {
        // A provider adapter throwing at all (rather than returning
        // status: "ambiguous") is itself a bug in that adapter per the
        // interface contract (bankProvider.interface.js) - treat it the
        // same as "ambiguous" rather than assuming it's safe to reverse,
        // since we genuinely don't know what happened.
        providerResult = { status: "ambiguous", providerReference: null, raw: { adapterThrew: err.message } };
    }

    if (providerResult.status === "accepted") {
        // Guarded transition: only flip pending -> success. If this
        // payout's status is no longer "pending" (e.g. the stuck-
        // transfer recovery job already moved it to "requires_review"
        // after a prior crash, or - in a future retry-capable version
        // of this function - a concurrent attempt already resolved it),
        // do NOT blindly overwrite whatever an operator or another
        // process has since recorded. A plain `payout.save()` here
        // would silently clobber that with no trace of the conflict.
        const updated = await Payout.findOneAndUpdate(
            { _id: payout._id, status: "pending" },
            { $set: { status: "success", providerReference: providerResult.providerReference } },
            { new: true }
        );

        if (updated) {
            payout = updated;
            await auditLog.record({
                actorType: "system",
                actorRef: "payout_processor",
                action: "payout.success",
                entityType: "Payout",
                entityRef: payout._id.toString(),
                metadata: { amount, destinationAccountNumber, provider: providerResult.providerReference }
            });
        } else {
            // Someone/something else already moved this payout off
            // "pending" before we could mark it success. The provider
            // call itself succeeded - don't lose that fact silently.
            await auditLog.record({
                actorType: "system",
                actorRef: "payout_processor",
                action: "payout.success_but_status_already_changed",
                entityType: "Payout",
                entityRef: payout._id.toString(),
                severity: "critical",
                metadata: { amount, destinationAccountNumber, providerReference: providerResult.providerReference }
            });
            payout = await Payout.findById(payout._id);
        }
    } else if (providerResult.status === "rejected") {
        // Definitive refusal - the provider is telling us the money
        // never left. Safe to reverse immediately.
        await reversePayout(payout, `provider_rejected: ${JSON.stringify(providerResult.raw || {})}`);
        payout = await Payout.findById(payout._id);
    } else {
        // "ambiguous" - the exact case the audit warned about: a
        // timeout or connection failure tells you NOTHING about whether
        // the transfer actually happened. Reversing here could hand
        // back pool funds for a payout that genuinely succeeded at the
        // bank. Flag for review (same status/guarded-transition pattern
        // the stuck-transfer recovery job uses) instead of guessing.
        const updated = await Payout.findOneAndUpdate(
            { _id: payout._id, status: "pending" },
            { $set: { status: "requires_review" } },
            { new: true }
        );
        if (updated) payout = updated;

        await auditLog.record({
            actorType: "system",
            actorRef: "payout_processor",
            action: "payout.flagged_requires_review_ambiguous_provider_response",
            entityType: "Payout",
            entityRef: payout._id.toString(),
            severity: "critical",
            metadata: { amount, destinationAccountNumber, raw: providerResult.raw }
        });
        payout = await Payout.findById(payout._id);
    }

    return { duplicate: false, payout };
}

async function reversePayout(payout, reason) {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        // Guarded: only reverse a payout that's still "pending". If a
        // prior crash already got this payout marked "success" (money
        // really did leave) or the recovery job already flagged it
        // "requires_review", reversing here would incorrectly hand
        // pool funds back for a payout that either succeeded or whose
        // outcome is genuinely unknown - see the model comment on
        // "requires_review" for why that distinction matters.
        const updated = await Payout.findOneAndUpdate(
            { _id: payout._id, status: "pending" },
            { $set: { status: "failed", failureReason: reason } },
            { new: true, session }
        );

        if (!updated) {
            await session.abortTransaction();
            session.endSession();
            await auditLog.record({
                actorType: "system",
                actorRef: "payout_processor",
                action: "payout.reversal_skipped_status_already_changed",
                entityType: "Payout",
                entityRef: payout._id.toString(),
                severity: "critical",
                metadata: { reason }
            });
            return;
        }

        await postPoolEntry({
            pool: payout.pool,
            direction: "credit",
            amount: payout.amount,
            sourceType: "reversal",
            sourceRef: `${payout._id.toString()}_reversal`,
            description: `Payout reversal: ${reason}`,
            session
        });
        await creditPool(payout.pool, payout.amount, session);

        await session.commitTransaction();
        session.endSession();

        await auditLog.record({
            actorType: "system",
            actorRef: "payout_processor",
            action: "payout.reversed",
            entityType: "Payout",
            entityRef: payout._id.toString(),
            severity: "warning",
            metadata: { reason }
        });
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
}

module.exports = { processPayout, reversePayout };
