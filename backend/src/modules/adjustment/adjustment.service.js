// src/modules/adjustment/adjustment.service.js
const mongoose = require("mongoose");
const Wallet = require("../wallet/wallet.model");
const Adjustment = require("./adjustment.model");
const { postSingleEntry } = require("../ledger/ledger.service");
const auditLog = require("../audit/auditLog.service");

async function applyAdjustment({
    accountNumber,
    direction,
    amount,
    reference,
    reason,
    performedBy = null
}) {
    amount = Number(amount);

    if (!accountNumber) throw new Error("accountNumber_required");
    if (!["credit", "debit"].includes(direction)) throw new Error("invalid_direction");
    if (!Number.isInteger(amount) || amount <= 0) throw new Error("invalid_adjustment_amount");
    if (!reference) throw new Error("reference_required");
    if (!reason || !reason.trim()) throw new Error("reason_required");

    const existing = await Adjustment.findOne({ reference });
    if (existing) return { duplicate: true, adjustment: existing };

    const session = await mongoose.startSession();
    let adjustment;
    let walletId;

    try {
        session.startTransaction();

        const wallet = await Wallet.findOne({ accountNumber }).session(session);
        if (!wallet) throw new Error("wallet_not_found");

        if (direction === "debit" && wallet.balance < amount) {
            throw new Error("insufficient_balance_for_debit_adjustment");
        }

        wallet.balance = direction === "credit"
            ? wallet.balance + amount
            : wallet.balance - amount;

        await wallet.save({ session });

        [adjustment] = await Adjustment.create(
            [{ reference, wallet: wallet._id, direction, amount, reason, performedBy, status: "applied" }],
            { session, ordered: true }
        );

        await postSingleEntry({
            wallet: wallet._id,
            direction,
            amount,
            sourceType: "adjustment",
            sourceRef: adjustment._id.toString(),
            description: reason,
            session
        });

        await session.commitTransaction();
        session.endSession();

        walletId = wallet._id.toString();

    } catch (err) {
        await session.abortTransaction();
        session.endSession();

        if (err.code === 11000) {
            const raced = await Adjustment.findOne({ reference });
            if (raced) return { duplicate: true, adjustment: raced };
        }
        throw err;
    }

    // Deliberately "critical" severity, unlike most audit events here -
    // every adjustment is a place the wallet ledger moves without a
    // matching real settlement-pool event, so every one of these should
    // stand out to anyone reviewing the audit log, not blend in with
    // routine transfer/login activity.
    await auditLog.record({
        actorType: "admin",
        actorRef: performedBy || "unknown_admin",
        action: direction === "credit" ? "adjustment.credit_applied" : "adjustment.debit_applied",
        entityType: "Adjustment",
        entityRef: adjustment._id.toString(),
        severity: "critical",
        metadata: { accountNumber, amount, reason, walletId, reference }
    });

    return { duplicate: false, adjustment };
}

module.exports = { applyAdjustment };
