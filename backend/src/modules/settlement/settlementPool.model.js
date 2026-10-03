// src/modules/settlement/settlementPool.model.js
//
// A pool represents actual bank-held funds - the real money backing a
// group of virtual accounts (Wallets). Wallet.balance is still each
// user's own sub-ledger view; poolBalance is the aggregate that must
// always be >= the sum of the wallets linked to it.
//
//   SettlementPool (poolBalance: 100,000,000)
//         │
//    ┌────┼────┐
//    ▼    ▼    ▼
//   VA-A VA-B VA-C   (Wallets with pool = this pool's _id)
//   20k  30k  50k
//
// One pool today (SwiftPay's), but the schema supports more than one
// linked service pooling funds separately without changes.

const mongoose = require("mongoose");

const settlementPoolSchema = new mongoose.Schema(
    {
        label: {
            type: String,
            required: true // e.g. "SwiftPay Settlement Pool"
        },

        // Which partner this pool backs (see src/modules/partner/).
        // Mirrors Wallet.linkedService so a wallet's pool link and its
        // linkedService flag should always agree. Was a hardcoded
        // enum: ["swiftpay"] - now any string, validated against a
        // live, active Partner record at pool-creation time
        // (settlementPool.service.js / admin.service.js) instead of a
        // fixed list baked into the schema.
        linkedService: {
            type: String,
            required: true
        },

        // Cached aggregate balance. Source of truth is PoolLedgerEntry
        // (see ledger/poolLedger.model.js) - this field can always be
        // rebuilt from that history, same relationship as Wallet.balance
        // to LedgerEntry.
        poolBalance: {
            type: Number,
            default: 0
        },

        currency: {
            type: String,
            default: "NGN"
        },

        status: {
            type: String,
            enum: ["active", "suspended"],
            default: "active"
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("SettlementPool", settlementPoolSchema);
