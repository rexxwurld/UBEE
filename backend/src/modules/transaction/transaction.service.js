const mongoose = require("mongoose");
const axios = require("axios");
const crypto = require("crypto");
const Wallet = require("../wallet/wallet.model");
const User = require("../auth/user.model");
const Transaction = require("./transaction.model");
const { signPayload } = require("../../utils/webhookSignature");
const { SWIFTPAY_WEBHOOK_URL, SWIFTPAY_WEBHOOK_SECRET } = require("../../config/env");
const { getPartnerBySlug } = require("../partner/partner.service");
const { postTransferEntries } = require("../ledger/ledger.service");
const auditLog = require("../audit/auditLog.service");
const { getLimitsForTier } = require("../../config/limits");

const transfer = async (
    senderId,
    receiverAccountNumber,
    amount,
    description,
    bank,
    idempotencyKey = null
) => {

    amount = Number(amount);

    if (idempotencyKey) {
        const existing = await Transaction.findOne({ idempotencyKey, sender: senderId, type: "debit" });
        if (existing) return { duplicate: true, transactions: [existing] };
    }

    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Invalid transfer amount");
    }

    // Tiered by the sender's KYC level (Phase 3) rather than one flat
    // limit for every user - see src/config/limits.js for the tier
    // figures and its accuracy caveat.
    const sender = await User.findById(senderId);
    if (!sender) throw new Error("sender_not_found");

    if (sender.accountState !== "active") {
        // frozen/dormant/closed - see user.model.js's accountState field.
        // Deliberately generic message to the caller (don't reveal
        // exactly why an account can't transact over the API); the real
        // reason is captured in accountStateReason for an operator.
        throw new Error("account_not_active_for_transfers");
    }

    const limits = getLimitsForTier(sender.kycTier);

    if (amount > limits.maxSingleTransfer) {
        throw new Error(`Transfer exceeds the maximum single transfer limit for your account tier (₦${limits.maxSingleTransfer})`);
    }

    const dayStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [dailyAgg] = await Transaction.aggregate([
        { $match: { sender: senderId, type: "debit", status: "success", createdAt: { $gte: dayStart } } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);
    const dailyTotal = (dailyAgg?.total || 0) + amount;
    if (dailyTotal > limits.maxDailyOutbound) {
        await auditLog.record({
            actorType: "user",
            actorRef: senderId.toString(),
            action: "transfer.blocked_daily_limit",
            severity: "warning",
            metadata: { amount, dailyTotal, kycTier: sender.kycTier }
        });
        throw new Error(`Transfer would exceed your daily outbound limit for your account tier (₦${limits.maxDailyOutbound})`);
    }

    const session = await mongoose.startSession();

    let receiverWalletForWebhook = null;
    let webhookTransactionId = null;
    let transaction;

    try {
        session.startTransaction();

        const senderWallet = await Wallet.findOne({ userId: senderId }).session(session);

        if (!senderWallet) throw new Error("Sender wallet not found");

        if (senderWallet.balance < amount) {
            throw new Error("Insufficient balance");
        }

        const receiverWallet = await Wallet.findOne({
            accountNumber: receiverAccountNumber
        }).session(session);

        if (!receiverWallet) throw new Error("Sending to other banks not allowed");

        if (senderWallet.accountNumber === receiverWallet.accountNumber) {
            throw new Error("Cannot transfer to self");
        }

        // Receiver-side account-state check (Phase 3). Only applies to
        // end-user wallets (receiverWallet.userId set) - pool/virtual
        // accounts (linkedService: "swiftpay") don't have an owning User
        // and so have no accountState to check.
        if (receiverWallet.userId) {
            const receiverUser = await User.findById(receiverWallet.userId).session(session);
            if (receiverUser && receiverUser.accountState !== "active") {
                throw new Error("receiver_account_not_active");
            }
        }

        senderWallet.balance -= amount;
        await senderWallet.save({ session });

        receiverWallet.balance += amount;
        await receiverWallet.save({ session });

        const effectiveKey = idempotencyKey || `auto_${crypto.randomBytes(12).toString("hex")}`;

        transaction = await Transaction.create([
            {
                idempotencyKey: effectiveKey,
                sender: senderId,
                receiver: receiverWallet.userId,
                amount,
                description,
                bank,
                accountNumber: receiverAccountNumber,
                type: "debit",
                status: "success"
            },
            {
                sender: senderId,
                receiver: receiverWallet.userId,
                amount,
                description,
                bank,
                accountNumber: receiverAccountNumber,
                type: "credit",
                status: "success"
            }
        ], { session, ordered: true });

        await postTransferEntries({
            entryGroup: `txn_${transaction[0]._id}`,
            amount,
            senderWalletId: senderWallet._id,
            receiverWalletId: receiverWallet._id,
            sourceRef: transaction[0]._id.toString(),
            session
        });

        await session.commitTransaction();
        session.endSession();

        receiverWalletForWebhook = receiverWallet;
        webhookTransactionId = transaction[1]._id.toString();

        await auditLog.record({
            actorType: "user",
            actorRef: senderId.toString(),
            action: "transfer.completed",
            entityType: "Transaction",
            entityRef: transaction[0]._id.toString(),
            metadata: { amount, receiverAccountNumber }
        });

        // ================= NOTIFY PARTNER ================= //
        // NOTE: this covers deposits that arrive as an internal
        // wallet-to-wallet transfer. Deposits arriving from an external
        // bank now go through deposit.service.js -> processDeposit
        // instead, which also updates the SettlementPool balance (this
        // path doesn't).
        if (receiverWalletForWebhook.linkedService) {
            notifyPartnerOfTransfer(receiverWalletForWebhook.linkedService, {
                accountNumber: receiverWalletForWebhook.accountNumber,
                amountReceived: Math.round(amount * 100),
                currency: "NGN",
                bankReference: `rxpbank_${webhookTransactionId}`
            }).catch((err) => {
                console.error(`[webhook] failed to notify partner "${receiverWalletForWebhook.linkedService}":`, err.message);
            });
        }

        // ================= PUSH NOTIFICATION (Phase 10 prep) ================= //
        // Only for real end-user wallets (userId set) - a pool/virtual
        // account has no individual owner to notify. Fire-and-forget,
        // same principle as the partner webhook above: a failed/missing
        // push notification must never affect the transfer that already
        // committed above it.
        if (receiverWalletForWebhook.userId) {
            const { notifyUser } = require("../deviceToken/notification.service");
            notifyUser(receiverWalletForWebhook.userId, {
                type: "transfer_received",
                title: "Money received",
                body: `You received ₦${amount.toLocaleString()}`,
                data: { transactionId: webhookTransactionId }
            }).catch((err) => {
                console.error("[notification] failed to notify receiver of transfer:", err.message);
            });
        }

        return { duplicate: false, transactions: transaction };

    } catch (err) {
        await session.abortTransaction();
        session.endSession();

        if (err.code === 11000 && idempotencyKey) {
            const existingRace = await Transaction.findOne({ idempotencyKey, sender: senderId, type: "debit" });
            if (existingRace) return { duplicate: true, transactions: [existingRace] };
        }
        throw err;
    }
};

// GENERALIZED (Phase 3a) - see the matching function/comment in
// deposit.service.js:notifyPartnerOfDeposit for the full reasoning.
async function notifyPartnerOfTransfer(linkedServiceSlug, payload) {
    const partner = await getPartnerBySlug(linkedServiceSlug);

    const webhookUrl = partner ? partner.webhookUrl : SWIFTPAY_WEBHOOK_URL;
    const secret = partner ? partner.webhookSecret : SWIFTPAY_WEBHOOK_SECRET;

    if (!partner) {
        console.error(`[webhook] no Partner record for slug "${linkedServiceSlug}" - falling back to legacy global SwiftPay webhook config.`);
    }

    const signature = signPayload(payload, secret);

    await axios.post(webhookUrl, payload, {
        headers: {
            "x-partner-signature": signature,
            "Content-Type": "application/json"
        },
        timeout: 15000
    });
}

// PHASE 10: cursor-paginated - previously returned every transaction
// the user had ever made in one response with no limit at all, flagged
// directly in the audit's §17 ("Pagination... Absent... will be a real
// problem for a mobile client's transaction-history screen once users
// have more than a handful of transactions"). Same cursor pattern
// (limit + before, an ObjectId) already used by the Phase 6/7 admin
// investigation endpoints, now applied to the customer-facing one too.
const getUserTransactions = async (userId, { limit = 20, before } = {}) => {

    const query = {
        $or: [
            { sender: userId, type: "debit" },
            { receiver: userId, type: "credit" }
        ]
    };
    if (before) query._id = { $lt: before };

    const cappedLimit = Math.min(Number(limit) || 20, 100);

    const transactions = await Transaction.find(query)
        .sort({ _id: -1 })
        .limit(cappedLimit)
        .populate("sender", "fullname email")
        .populate("receiver", "fullname email");

    const mapped = transactions.map(tx => {

        let direction = "unknown";

        if (tx.type === "debit") direction = "sent";
        if (tx.type === "credit") direction = "received";

        return {
            _id: tx._id,
            amount: tx.amount,
            description: tx.description,
            type: tx.type,
            status: tx.status,
            direction,
            bank: tx.bank,
            accountNumber: tx.accountNumber,
            sender: tx.sender,
            receiver: tx.receiver,
            createdAt: tx.createdAt
        };
    });

    return {
        transactions: mapped,
        nextCursor: mapped.length === cappedLimit ? mapped[mapped.length - 1]._id : null
    };
};

module.exports = {
    transfer,
    getUserTransactions
};
