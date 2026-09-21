// src/modules/reconciliation/reconciliationException.model.js
//
// The "exception queue" the audit's §11 asked about and found absent:
// "No automated reconciliation loop, no exception queue, no alerting on
// mismatch exists anywhere in the code." This is that queue.
//
// One row per ONGOING discrepancy, not one row per reconciliation run -
// see reconciliation.service.js's upsert logic. A wallet whose cached
// balance has drifted from its ledger-derived balance gets exactly one
// open exception that gets refreshed (not duplicated) on every
// subsequent run until it's resolved, either by an operator
// (resolveException) or automatically if the numbers agree again on a
// later pass (self-healing, e.g. after a manual DB fix).

const mongoose = require("mongoose");

const reconciliationExceptionSchema = new mongoose.Schema(
    {
        type: {
            type: String,
            enum: [
                "wallet_ledger_mismatch",     // Wallet.balance vs ledger.service.js:computeBalance
                "pool_ledger_mismatch",       // SettlementPool.poolBalance vs poolLedger.service.js:computePoolBalance
                "pool_wallet_sum_mismatch"    // SettlementPool.poolBalance vs sum of its linked wallets' balances
            ],
            required: true
        },
        entityType: { type: String, enum: ["Wallet", "SettlementPool"], required: true },
        entityRef: { type: String, required: true },

        expectedBalance: { type: Number, required: true }, // ledger-derived (source of truth)
        actualBalance: { type: Number, required: true },   // cached field's current value
        difference: { type: Number, required: true },      // actual - expected

        status: { type: String, enum: ["open", "resolved"], default: "open" },

        firstDetectedAt: { type: Date, default: Date.now },
        lastCheckedAt: { type: Date, default: Date.now },
        checkCount: { type: Number, default: 1 }, // how many consecutive runs this has stayed open

        resolvedAt: { type: Date, default: null },
        resolvedBy: { type: String, default: null }, // "reconciliation_job" for auto-resolved, an admin username otherwise
        resolutionNotes: { type: String, default: null }
    },
    { timestamps: true }
);

// One open exception per (type, entityRef) at a time - this is exactly
// what makes the upsert-not-duplicate behavior in reconciliation.service.js
// safe under concurrent/overlapping runs, the same principle as the
// unique idempotency-key indexes used throughout the rest of this
// codebase (Transaction, Deposit, Payout, Refund).
reconciliationExceptionSchema.index(
    { type: 1, entityRef: 1, status: 1 },
    { unique: true, partialFilterExpression: { status: "open" } }
);

module.exports = mongoose.model("ReconciliationException", reconciliationExceptionSchema);
