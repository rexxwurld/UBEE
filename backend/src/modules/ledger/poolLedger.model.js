// src/modules/ledger/poolLedger.model.js
//
// Same immutable-append pattern as LedgerEntry, but for movements against
// a SettlementPool rather than a Wallet. This is the "bank ledger":
// deposits, payouts, settlement movements, fees, reversals at the pool
// level. LedgerEntry (wallet ledger) and PoolLedgerEntry (pool ledger)
// together let you reconcile: sum of wallet-level deposit/payout entries
// for a pool should always equal the pool's own entries.

const mongoose = require("mongoose");

const poolLedgerEntrySchema = new mongoose.Schema(
    {
        pool: { type: mongoose.Schema.Types.ObjectId, ref: "SettlementPool", required: true, index: true },
        direction: { type: String, enum: ["debit", "credit"], required: true },
        amount: { type: Number, required: true }, // always positive

        sourceType: {
            type: String,
            enum: ["deposit", "payout", "refund", "settlement", "fee", "reversal", "adjustment"],
            required: true
        },
        sourceRef: { type: String, required: true }, // Deposit._id, Payout._id, etc.

        description: { type: String }
    },
    { timestamps: true }
);

// Same duplicate-posting guard as the wallet ledger.
poolLedgerEntrySchema.index(
    { sourceType: 1, sourceRef: 1, pool: 1, direction: 1 },
    { unique: true }
);

module.exports = mongoose.model("PoolLedgerEntry", poolLedgerEntrySchema);
