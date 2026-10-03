// src/modules/ledger/ledger.model.js
//
// Wallet.balance is a fast-read cache. This collection is the source of
// truth: every transfer writes a debit row (sender) and a credit row
// (receiver) that are never edited or deleted. See rexxpay_infra's
// ledger module for the fuller explanation - same pattern, applied here
// to user-to-user wallet transfers instead of merchant settlement.

const mongoose = require("mongoose");

const ledgerEntrySchema = new mongoose.Schema(
    {
        entryGroup: { type: String, required: true, index: true }, // ties debit+credit together

        wallet: { type: mongoose.Schema.Types.ObjectId, ref: "Wallet", required: true, index: true },
        direction: { type: String, enum: ["debit", "credit"], required: true },
        amount: { type: Number, required: true }, // always positive

        sourceType: { type: String, enum: ["transfer", "adjustment", "reversal", "deposit", "payout"], required: true },
        sourceRef: { type: String, required: true }, // Transaction._id

        description: { type: String }
    },
    { timestamps: true }
);

// Guards against the same transfer leg being posted twice.
ledgerEntrySchema.index(
    { sourceType: 1, sourceRef: 1, wallet: 1, direction: 1 },
    { unique: true }
);

module.exports = mongoose.model("LedgerEntry", ledgerEntrySchema);
