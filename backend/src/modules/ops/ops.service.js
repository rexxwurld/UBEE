// src/modules/ops/ops.service.js
//
// Closes the audit's §9/§10 gap directly: "no customer lookup, account
// lookup, or transaction-search/investigation tooling of any kind - no
// admin route reads a specific user's transaction history, account
// status, or profile." This is that tooling.

const User = require("../auth/user.model");
const Wallet = require("../wallet/wallet.model");
const Transaction = require("../transaction/transaction.model");
const { computeBalance } = require("../ledger/ledger.service");

// GET /api/v1/admin/customers/search?query=
// Matches against email (exact/prefix), phone (exact/prefix), or a
// linked wallet's account number (exact - account numbers are fixed-
// length and unique, no reason to prefix-match them).
async function searchCustomers(query) {
    if (!query || query.trim().length < 2) throw new Error("query_too_short");
    const q = query.trim();

    // Try an exact account-number match first (wallet -> user), since
    // that's the most specific/common thing an operator has in hand
    // when investigating a specific transaction.
    const walletMatch = await Wallet.findOne({ accountNumber: q, userId: { $ne: null } });
    if (walletMatch) {
        const user = await User.findById(walletMatch.userId);
        if (user) return [user];
    }

    const regex = new RegExp(`^${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
    return User.find({ $or: [{ email: regex }, { phone: regex }] }).limit(25);
}

// GET /api/v1/admin/customers/:userId
// Full investigation-ready profile: identity, KYC state, account state,
// and wallet with both cached and ledger-derived balance side by side
// (same pairing as the Phase 6 ledger-history endpoint, useful here too
// so an operator doesn't have to jump between two screens to notice a
// drift while looking at a specific customer).
async function getCustomerProfile(userId) {
    const user = await User.findById(userId);
    if (!user) throw new Error("customer_not_found");

    const wallet = await Wallet.findOne({ userId: user._id });
    let walletSummary = null;
    if (wallet) {
        const ledgerBalance = await computeBalance(wallet._id);
        walletSummary = {
            walletId: wallet._id,
            accountNumber: wallet.accountNumber,
            cachedBalance: wallet.balance,
            ledgerDerivedBalance: ledgerBalance,
            inSync: wallet.balance === ledgerBalance
        };
    }

    return {
        userId: user._id,
        fullname: user.fullname,
        email: user.email,
        phone: user.phone,
        createdAt: user.createdAt,
        mfaEnabled: user.mfaEnabled,
        kycTier: user.kycTier,
        kycStatus: user.kycStatus,
        accountState: user.accountState,
        accountStateReason: user.accountStateReason,
        wallet: walletSummary
    };
}

// GET /api/v1/admin/transactions/search
// Filters: accountNumber (either side of the transfer - checked against
// both the sender's own wallet and the receiver-supplied accountNumber
// field), status, from/to (createdAt range). Cursor-paginated via
// `before` (a Transaction _id), same pattern as the Phase 6 ledger
// history endpoint.
async function searchTransactions({ accountNumber, status, from, to, before, limit = 50 }) {
    const query = {};

    if (accountNumber) {
        const wallet = await Wallet.findOne({ accountNumber });
        const senderIds = wallet && wallet.userId ? [wallet.userId] : [];
        query.$or = [
            { accountNumber }, // the receiver-side field stored directly on Transaction
            ...(senderIds.length ? [{ sender: { $in: senderIds } }] : [])
        ];
    }
    if (status) query.status = status;
    if (from || to) {
        query.createdAt = {};
        if (from) query.createdAt.$gte = new Date(from);
        if (to) query.createdAt.$lte = new Date(to);
    }
    if (before) query._id = { $lt: before };

    const transactions = await Transaction.find(query)
        .sort({ _id: -1 })
        .limit(Math.min(limit, 200))
        .populate("sender", "fullname email")
        .populate("receiver", "fullname email");

    return {
        transactions,
        nextCursor: transactions.length === Math.min(limit, 200) ? transactions[transactions.length - 1]._id : null
    };
}

// GET /api/v1/admin/transactions/:id
// Full detail for one transaction, plus its matching LedgerEntry rows
// (same entryGroup) - the debit+credit pair that actually moved the
// money, for an operator who needs to see the ledger-level view of one
// specific transfer, not just the Transaction summary row.
async function getTransactionDetail(transactionId) {
    const transaction = await Transaction.findById(transactionId)
        .populate("sender", "fullname email")
        .populate("receiver", "fullname email");
    if (!transaction) throw new Error("transaction_not_found");

    const LedgerEntry = require("../ledger/ledger.model");
    const ledgerEntries = await LedgerEntry.find({ sourceType: "transfer", sourceRef: transaction._id.toString() });

    return { transaction, ledgerEntries };
}

module.exports = { searchCustomers, getCustomerProfile, searchTransactions, getTransactionDetail };
