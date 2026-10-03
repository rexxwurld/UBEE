// src/modules/bankTransfer/bankTransfer.service.js
//
// Customer "To Bank" transfers. Flow (same safety shape as payouts):
//   1. validate, then ONE database transaction: debit the wallet
//      (amount + fee), write ledger entries, create BankTransfer +
//      history row as "pending". Commit.
//   2. ONLY THEN call the bank provider (a network call must never sit
//      inside a database transaction).
//   3. Outcome:
//        accepted  -> success
//        rejected  -> reverse: credit amount + fee back, status failed
//        ambiguous -> requires_review. NOT reversed: if the provider
//                     actually sent it, reversing would hand out free money.
//
// Works against whichever provider BANK_PROVIDER selects (src/providers/).
// With the default "mock" provider no real money leaves the system.

const mongoose = require("mongoose");
const crypto = require("crypto");
const BankTransfer = require("./bankTransfer.model");
const Wallet = require("../wallet/wallet.model");
const User = require("../auth/user.model");
const Transaction = require("../transaction/transaction.model");
const { postSingleEntry } = require("../ledger/ledger.service");
const auditLog = require("../audit/auditLog.service");
const { getLimitsForTier } = require("../../config/limits");
const { FEE, FREE_PER_DAY, MIN_AMOUNT, startOfLagosDay } = require("../../config/bankTransfer");
const { getActiveProvider, getActiveProviderName } = require("../../providers");

const COUNTS_AGAINST_FREE_ALLOWANCE = ["pending", "success", "requires_review"];

// ---------- read-only helpers for the app ----------

async function getConfig(userId) {
    const used = await BankTransfer.countDocuments({
        user: userId,
        status: { $in: COUNTS_AGAINST_FREE_ALLOWANCE },
        createdAt: { $gte: startOfLagosDay() }
    });
    const provider = getActiveProviderName();
    return {
        provider,
        testMode: provider === "mock", // no real money moves on the mock rail
        fee: FEE,
        freePerDay: FREE_PER_DAY,
        freeRemaining: Math.max(0, FREE_PER_DAY - used),
        minAmount: MIN_AMOUNT
    };
}

async function listBanks() {
    return getActiveProvider().listBanks();
}

async function nameEnquiry({ accountNumber, bankCode }) {
    return getActiveProvider().nameEnquiry({ accountNumber, bankCode });
}

// ---------- state transitions (all status-guarded, safe to repeat) ----------

async function markSuccess(bt, providerReference) {
    const updated = await BankTransfer.findOneAndUpdate(
        { _id: bt._id, status: { $in: ["pending", "requires_review"] } },
        { $set: { status: "success", providerReference: providerReference || bt.providerReference } },
        { new: true }
    );
    if (!updated) return false;
    if (updated.transaction) await Transaction.updateOne({ _id: updated.transaction }, { $set: { status: "success" } });
    return true;
}

async function flagForReview(bt, providerReference, why) {
    const updated = await BankTransfer.findOneAndUpdate(
        { _id: bt._id, status: "pending" },
        { $set: { status: "requires_review", providerReference: providerReference || null } },
        { new: true }
    );
    if (!updated) return false;
    await auditLog.record({
        actorType: "system",
        actorRef: "bank_transfer",
        action: "bank_transfer.flagged_requires_review",
        entityType: "BankTransfer",
        entityRef: bt._id.toString(),
        severity: "critical",
        metadata: { amount: bt.amount, fee: bt.fee, destinationAccountNumber: bt.destinationAccountNumber, why }
    });
    return true;
}

// Returns the customer's money (amount + fee) and marks the transfer failed.
async function reverse(btId, reason, actorRef = "bank_transfer") {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const bt = await BankTransfer.findOneAndUpdate(
            { _id: btId, status: { $in: ["pending", "requires_review"] } },
            { $set: { status: "failed", failureReason: reason } },
            { new: true, session }
        );
        if (!bt) { await session.abortTransaction(); return false; }

        const wallet = await Wallet.findOne({ userId: bt.user }).session(session);
        if (!wallet) throw new Error("wallet_not_found");

        wallet.balance += bt.amount + bt.fee;
        await wallet.save({ session });

        await postSingleEntry({
            wallet: wallet._id, direction: "credit", amount: bt.amount,
            sourceType: "reversal", sourceRef: String(bt._id),
            description: `Reversal: transfer to ${bt.destinationAccountName || bt.destinationAccountNumber}`, session
        });
        if (bt.fee > 0) {
            await postSingleEntry({
                wallet: wallet._id, direction: "credit", amount: bt.fee,
                sourceType: "reversal", sourceRef: `${bt._id}:fee`,
                description: "Reversal: bank transfer fee", session
            });
        }
        if (bt.transaction) await Transaction.updateOne({ _id: bt.transaction }, { $set: { status: "failed" } }, { session });

        await session.commitTransaction();

        await auditLog.record({
            actorType: "system", actorRef,
            action: "bank_transfer.reversed",
            entityType: "BankTransfer", entityRef: bt._id.toString(),
            severity: "warning", metadata: { reason, amount: bt.amount, fee: bt.fee }
        });
        return true;
    } catch (err) {
        if (session.inTransaction()) await session.abortTransaction();
        throw err;
    } finally {
        session.endSession();
    }
}

// ---------- the transfer ----------

async function initiate(userId, { accountNumber, bankCode, amount, description = "", idempotencyKey }) {
    amount = Number(amount);
    const key = idempotencyKey || `auto_${crypto.randomBytes(12).toString("hex")}`;

    const existing = await BankTransfer.findOne({ user: userId, idempotencyKey: key });
    if (existing) return { duplicate: true, transfer: existing };

    if (!Number.isInteger(amount) || amount <= 0) throw new Error("Enter a whole-naira amount");
    if (amount < MIN_AMOUNT) throw new Error(`The minimum bank transfer is ₦${MIN_AMOUNT}`);
    if (!/^\d{10}$/.test(accountNumber || "")) throw new Error("Account number must be 10 digits");

    const user = await User.findById(userId);
    if (!user) throw new Error("sender_not_found");
    if (user.accountState !== "active") throw new Error("account_not_active_for_transfers");

    // Same tier limits as wallet-to-wallet transfers (config/limits.js).
    const limits = getLimitsForTier(user.kycTier);
    if (amount > limits.maxSingleTransfer) {
        throw new Error(`Transfer exceeds the maximum single transfer limit for your account tier (₦${limits.maxSingleTransfer})`);
    }
    const [dailyAgg] = await Transaction.aggregate([
        { $match: { sender: user._id, type: "debit", status: { $in: ["success", "pending"] }, createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    if ((dailyAgg?.total || 0) + amount > limits.maxDailyOutbound) {
        throw new Error(`Transfer would exceed your daily outbound limit for your account tier (₦${limits.maxDailyOutbound})`);
    }

    // Never trust the client for who is being paid: ask the provider ourselves.
    const provider = getActiveProvider();
    const bank = (await provider.listBanks()).find((b) => b.code === bankCode);
    if (!bank) throw new Error("That bank is not supported");

    let accountName;
    try {
        ({ accountName } = await provider.nameEnquiry({ accountNumber, bankCode }));
    } catch (err) {
        throw new Error("We couldn't verify that account. Check the number and bank.");
    }
    if (!accountName) throw new Error("We couldn't verify that account. Check the number and bank.");

    // ---- step 1: debit + record, atomically ----
    const session = await mongoose.startSession();
    let bt;
    try {
        session.startTransaction();

        const wallet = await Wallet.findOne({ userId }).session(session);
        if (!wallet) throw new Error("Sender wallet not found");

        // Decided inside the transaction, after touching the wallet, so two
        // simultaneous requests can't both claim the last free transfer
        // (they conflict on the wallet row and one is retried).
        const usedToday = await BankTransfer.countDocuments({
            user: userId, status: { $in: COUNTS_AGAINST_FREE_ALLOWANCE }, createdAt: { $gte: startOfLagosDay() }
        }).session(session);
        const fee = usedToday >= FREE_PER_DAY ? FEE : 0;
        const total = amount + fee;

        if (wallet.balance < total) {
            throw new Error(fee > 0
                ? `Insufficient balance. You need ₦${total} (₦${amount} + ₦${fee} fee).`
                : "Insufficient balance");
        }

        wallet.balance -= total;
        await wallet.save({ session });

        [bt] = await BankTransfer.create([{
            user: userId, idempotencyKey: key, amount, fee,
            destinationAccountNumber: accountNumber, destinationBankCode: bankCode,
            destinationBankName: bank.name, destinationAccountName: accountName,
            description, status: "pending"
        }], { session });

        const [tx] = await Transaction.create([{
            idempotencyKey: `bt_${bt._id}`,
            sender: userId, receiver: null,
            amount, fee, recipientName: accountName,
            description, bank: bank.name, accountNumber,
            type: "debit", status: "pending"
        }], { session });

        bt.transaction = tx._id;
        await bt.save({ session });

        await postSingleEntry({
            wallet: wallet._id, direction: "debit", amount,
            sourceType: "payout", sourceRef: String(bt._id),
            description: `Transfer to ${accountName} (${bank.name})`, session
        });
        if (fee > 0) {
            await postSingleEntry({
                wallet: wallet._id, direction: "debit", amount: fee,
                sourceType: "payout", sourceRef: `${bt._id}:fee`,
                description: "Bank transfer fee", session
            });
        }

        await session.commitTransaction();
    } catch (err) {
        if (session.inTransaction()) await session.abortTransaction();

        // Same key arrived twice at once: the other request won, return its result.
        if (err && err.code === 11000) {
            const winner = await BankTransfer.findOne({ user: userId, idempotencyKey: key });
            if (winner) return { duplicate: true, transfer: winner };
        }
        if (err && typeof err.hasErrorLabel === "function" && err.hasErrorLabel("TransientTransactionError")) {
            throw new Error("Another transaction is being processed. Please try again.");
        }
        throw err;
    } finally {
        session.endSession();
    }

    await auditLog.record({
        actorType: "user", actorRef: String(userId),
        action: "bank_transfer.initiated",
        entityType: "BankTransfer", entityRef: bt._id.toString(),
        severity: "info",
        metadata: { amount, fee: bt.fee, bank: bank.name, destinationAccountNumber: accountNumber }
    });

    // ---- step 2: the provider call, outside any DB transaction ----
    let result;
    try {
        result = await provider.initiateTransfer({
            amount, destinationAccountNumber: accountNumber, destinationBankCode: bankCode,
            destinationAccountName: accountName, reference: bt._id.toString(),
            narration: description || "U-BEE transfer"
        });
    } catch (err) {
        // The interface says this shouldn't throw, but if it does we can't
        // know whether the bank got the instruction - treat as ambiguous.
        result = { status: "ambiguous", providerReference: null, raw: { error: err.message } };
    }

    // ---- step 3: settle the outcome ----
    if (result.status === "accepted") await markSuccess(bt, result.providerReference);
    else if (result.status === "rejected") await reverse(bt._id, "provider_rejected");
    else await flagForReview(bt, result.providerReference, "provider_outcome_ambiguous");

    return { duplicate: false, transfer: await BankTransfer.findById(bt._id) };
}

// ---------- recovery (called by src/jobs/recoverStuckTransfers.job.js) ----------

async function resolveStuck(cutoff) {
    const stuck = await BankTransfer.find({
        status: { $in: ["pending", "requires_review"] },
        createdAt: { $lt: cutoff }
    });

    let resolved = 0;
    let flagged = 0;
    for (const bt of stuck) {
        let result;
        try {
            result = await getActiveProvider().checkTransferStatus({ reference: bt._id.toString(), providerReference: bt.providerReference });
        } catch (err) {
            result = { status: "unknown" };
        }

        if (result.status === "success") {
            if (await markSuccess(bt, bt.providerReference)) resolved++;
        } else if (result.status === "failed") {
            if (await reverse(bt._id, "provider_confirmed_failed_via_status_check", "recovery_job")) resolved++;
        } else if (bt.status === "pending") {
            if (await flagForReview(bt, bt.providerReference, "stuck_past_threshold_provider_status_unknown")) flagged++;
        }
        // already requires_review + still unknown: leave it for a human, don't spam the audit log
    }
    return { resolved, flagged };
}

module.exports = { getConfig, listBanks, nameEnquiry, initiate, reverse, resolveStuck, markSuccess };
