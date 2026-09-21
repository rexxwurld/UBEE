// src/modules/ledger/ledger.service.js
const LedgerEntry = require("./ledger.model");

/**
 * Posts a balanced debit+credit pair for one transfer leg. Must be called
 * inside the same mongoose session as the Wallet.balance update, so the
 * cached balance and the ledger can never drift apart.
 */
async function postTransferEntries({ entryGroup, amount, senderWalletId, receiverWalletId, sourceRef, session }) {
    if (!Number.isInteger(amount) || amount <= 0) {
        throw new Error("ledger_invalid_amount");
    }
    if (!session) {
        throw new Error("ledger_requires_session");
    }

    return LedgerEntry.create(
        [
            {
                entryGroup,
                wallet: senderWalletId,
                direction: "debit",
                amount,
                sourceType: "transfer",
                sourceRef,
                description: "Transfer sent"
            },
            {
                entryGroup,
                wallet: receiverWalletId,
                direction: "credit",
                amount,
                sourceType: "transfer",
                sourceRef,
                description: "Transfer received"
            }
        ],
        { session, ordered: true }
    );
}

/**
 * Deposits and payouts only touch one Wallet (the counterparty is the
 * SettlementPool, not another wallet), so unlike postTransferEntries this
 * posts a single leg. entryGroup is set to sourceRef since there's no
 * second leg to pair with in this collection - the pairing "other side"
 * lives in PoolLedgerEntry instead.
 *
 * Also used for admin-initiated "adjustment" entries (see
 * src/modules/adjustment) - a manual correction is, structurally, the
 * same kind of single-leg wallet movement as a deposit/payout, just
 * initiated by an operator instead of an external event. It is NOT
 * backed by a SettlementPool movement, which is why it's flagged
 * "critical" severity in the audit log at the call site - an
 * adjustment moves a customer's ledger balance without a matching
 * external cash movement, so every one of these should be reviewable.
 */
async function postSingleEntry({ wallet, direction, amount, sourceType, sourceRef, description, session }) {
    if (!Number.isInteger(amount) || amount <= 0) {
        throw new Error("ledger_invalid_amount");
    }
    if (!session) {
        throw new Error("ledger_requires_session");
    }
    if (!["deposit", "payout", "adjustment"].includes(sourceType)) {
        throw new Error("ledger_use_postTransferEntries_for_transfers");
    }

    const [entry] = await LedgerEntry.create(
        [{ entryGroup: sourceRef, wallet, direction, amount, sourceType, sourceRef, description }],
        { session, ordered: true }
    );
    return entry;
}

async function computeBalance(walletId) {
    const [result] = await LedgerEntry.aggregate([
        { $match: { wallet: walletId } },
        {
            $group: {
                _id: null,
                credits: { $sum: { $cond: [{ $eq: ["$direction", "credit"] }, "$amount", 0] } },
                debits: { $sum: { $cond: [{ $eq: ["$direction", "debit"] }, "$amount", 0] } }
            }
        }
    ]);
    if (!result) return 0;
    return result.credits - result.debits;
}

module.exports = { postTransferEntries, postSingleEntry, computeBalance };
