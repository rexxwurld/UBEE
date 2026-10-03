// src/modules/ledger/ledger.admin.controller.js
//
// Closes a gap the audit named directly (§15, on whether an operator
// could investigate "₦100,000 disappeared from this customer's account
// yesterday"): computeBalance() existed but nothing surfaced the
// underlying ledger entries to an operator via an API - this does.

const mongoose = require("mongoose");
const LedgerEntry = require("./ledger.model");
const { computeBalance } = require("./ledger.service");
const Wallet = require("../wallet/wallet.model");

// GET /api/v1/admin/wallets/:walletId/ledger?limit=&before=
// Returns the wallet's full ledger history (newest first, cursor-
// paginated via `before`, an ISO date or entry _id), plus both the
// ledger-derived balance (source of truth) and the wallet's cached
// balance side by side - an operator can see at a glance whether they
// agree, without a separate reconciliation lookup.
exports.getWalletLedger = async (req, res) => {
    try {
        const { walletId } = req.params;
        const limit = Math.min(Number(req.query.limit) || 50, 200);

        const wallet = await Wallet.findById(walletId);
        if (!wallet) return res.status(404).json({ status: false, message: "wallet_not_found" });

        const query = { wallet: wallet._id };
        if (req.query.before) {
            query._id = { $lt: new mongoose.Types.ObjectId(req.query.before) };
        }

        const entries = await LedgerEntry.find(query).sort({ _id: -1 }).limit(limit);
        const ledgerBalance = await computeBalance(wallet._id);

        res.json({
            status: true,
            data: {
                walletId: wallet._id,
                accountNumber: wallet.accountNumber,
                cachedBalance: wallet.balance,
                ledgerDerivedBalance: ledgerBalance,
                inSync: wallet.balance === ledgerBalance,
                entries,
                nextCursor: entries.length === limit ? entries[entries.length - 1]._id : null
            }
        });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};
