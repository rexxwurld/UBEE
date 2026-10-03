// src/modules/refund/refund.service.js
//
// Bank-side refund instructions received from SwiftPay. A refund drains
// the linked service's settlement pool, just like a payout, but the bank
// outcome is asynchronous: acceptance here means "instruction queued",
// not "customer received the money".

const mongoose = require("mongoose");
const crypto = require("crypto");
const Refund = require("./refund.model");
const SettlementPool = require("../settlement/settlementPool.model");
const { postPoolEntry } = require("../ledger/poolLedger.service");
const { getPoolByService, debitPool, creditPool } = require("../settlement/settlementPool.service");
const auditLog = require("../audit/auditLog.service");
const { getActiveProvider } = require("../../providers");

function generateRefundReference() {
    return `rf_${crypto.randomBytes(12).toString("hex")}`;
}

async function processRefund({
    idempotencyKey,
    linkedService = "swiftpay",
    originalBankReference,
    destinationAccountNumber,
    destinationBank,
    destinationAccountName = "",
    amount,
    currency = "NGN"
}) {
    amount = Number(amount);

    if (!idempotencyKey) throw new Error("idempotencyKey_required");
    if (!originalBankReference) throw new Error("original_bank_reference_required");
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("invalid_refund_amount");
    if (!destinationAccountNumber || !destinationBank) throw new Error("destination_required");

    const existing = await Refund.findOne({ idempotencyKey });
    if (existing) return { duplicate: true, refund: existing };

    const pool = await getPoolByService(linkedService);
    if (!pool) throw new Error("settlement_pool_not_found");

    const session = await mongoose.startSession();
    let refund;

    try {
        session.startTransaction();

        const freshPool = await SettlementPool.findById(pool._id).session(session);
        if (!freshPool) throw new Error("settlement_pool_not_found");
        if (freshPool.poolBalance < amount) throw new Error("insufficient_pool_funds");

        [refund] = await Refund.create([{
            idempotencyKey,
            reference: generateRefundReference(),
            pool: pool._id,
            linkedService,
            originalBankReference,
            destinationAccountNumber,
            destinationBank,
            destinationAccountName,
            amount,
            currency,
            status: "pending"
        }], { session, ordered: true });

        // Reserve the real bank-held funds in the settlement pool.
        await postPoolEntry({
            pool: pool._id,
            direction: "debit",
            amount,
            sourceType: "refund",
            sourceRef: refund._id.toString(),
            description: `Refund to ${destinationAccountNumber}`,
            session
        });
        await debitPool(pool._id, amount, session);

        await session.commitTransaction();
        session.endSession();
    } catch (err) {
        await session.abortTransaction();
        session.endSession();

        if (err.code === 11000) {
            const raced = await Refund.findOne({ idempotencyKey });
            if (raced) return { duplicate: true, refund: raced };
        }
        throw err;
    }

    let providerResult;
    try {
        providerResult = await getActiveProvider().initiateTransfer({
            amount,
            destinationAccountNumber: refund.destinationAccountNumber,
            destinationBankCode: refund.destinationBank,
            destinationAccountName: refund.destinationAccountName,
            reference: refund._id.toString(),
            narration: `Refund ${refund._id.toString()} for ${originalBankReference}`
        });
    } catch (err) {
        providerResult = { status: "ambiguous", providerReference: null, raw: { adapterThrew: err.message } };
    }

    if (providerResult.status === "accepted") {
        // Guarded transition: only flip pending -> processing. See the
        // matching comment in payout.service.js - a plain refund.save()
        // here could silently clobber a status the recovery job or an
        // operator already changed while this call was in flight.
        const updated = await Refund.findOneAndUpdate(
            { _id: refund._id, status: "pending" },
            { $set: { status: "processing", providerRef: providerResult.providerReference, failureReason: null } },
            { new: true }
        );

        if (updated) {
            refund = updated;
            await auditLog.record({
                actorType: "system",
                actorRef: "refund_processor",
                action: "refund.submitted",
                entityType: "Refund",
                entityRef: refund._id.toString(),
                metadata: { providerReference: providerResult.providerReference, amount, destinationAccountNumber }
            });
        } else {
            await auditLog.record({
                actorType: "system",
                actorRef: "refund_processor",
                action: "refund.submitted_but_status_already_changed",
                entityType: "Refund",
                entityRef: refund._id.toString(),
                severity: "critical",
                metadata: { amount, destinationAccountNumber, providerReference: providerResult.providerReference }
            });
            refund = await Refund.findById(refund._id);
        }
    } else if (providerResult.status === "rejected") {
        // Definitive refusal before the provider took the instruction -
        // safe to return the reserved pool funds immediately.
        await reverseRefund(refund, `provider_rejected: ${JSON.stringify(providerResult.raw || {})}`);
        refund = await Refund.findById(refund._id);
    } else {
        // "ambiguous" - exactly the case this file's own comment used to
        // warn about before there was a real branch to handle it:
        // "Network ambiguity must NOT be auto-reversed." Flag for
        // review instead of guessing whether the money actually left.
        const updated = await Refund.findOneAndUpdate(
            { _id: refund._id, status: "pending" },
            { $set: { status: "requires_review" } },
            { new: true }
        );
        if (updated) refund = updated;

        await auditLog.record({
            actorType: "system",
            actorRef: "refund_processor",
            action: "refund.flagged_requires_review_ambiguous_provider_response",
            entityType: "Refund",
            entityRef: refund._id.toString(),
            severity: "critical",
            metadata: { amount, destinationAccountNumber, raw: providerResult.raw }
        });
        refund = await Refund.findById(refund._id);
    }

    return { duplicate: false, refund };
}

async function reverseRefund(refund, reason) {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        // Guarded: only reverse a refund still at "pending". If it's
        // already "processing" (accepted by the provider) or has been
        // flagged "requires_review" by the recovery job, reversing here
        // would incorrectly return pool funds for a refund that may
        // have already gone out, or whose outcome is genuinely unknown.
        const updated = await Refund.findOneAndUpdate(
            { _id: refund._id, status: "pending" },
            { $set: { status: "failed", failureReason: reason, reversedAt: new Date() } },
            { new: true, session }
        );

        if (!updated) {
            await session.abortTransaction();
            session.endSession();
            await auditLog.record({
                actorType: "system",
                actorRef: "refund_processor",
                action: "refund.reversal_skipped_status_already_changed",
                entityType: "Refund",
                entityRef: refund._id.toString(),
                severity: "critical",
                metadata: { reason }
            });
            return refund;
        }

        await postPoolEntry({
            pool: refund.pool,
            direction: "credit",
            amount: refund.amount,
            sourceType: "reversal",
            sourceRef: `${refund._id.toString()}_reversal`,
            description: `Refund reversal: ${reason}`,
            session
        });

        await creditPool(refund.pool, refund.amount, session);

        await session.commitTransaction();
        session.endSession();

        return updated;
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw err;
    }
}

async function getRefundByReference(reference) {
    return Refund.findOne({ reference });
}

module.exports = { processRefund, getRefundByReference, reverseRefund };
