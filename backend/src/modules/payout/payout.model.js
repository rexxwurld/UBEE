// src/modules/payout/payout.model.js
//
// One row per payout instruction received from SwiftPay. idempotencyKey
// is SwiftPay's key - unique index means a retried instruction can
// never pay out twice.

const mongoose = require("mongoose");

const payoutSchema = new mongoose.Schema(
    {
        idempotencyKey: { type: String, required: true, unique: true },

        pool: { type: mongoose.Schema.Types.ObjectId, ref: "SettlementPool", required: true },

        // Payouts drain the pool's aggregate balance directly, not any one
        // customer's virtual account - there's no single wallet that "sent"
        // the money, so this is informational only (which pool account we
        // attributed the instruction to for reporting), never required and
        // never debited.
        sourceWallet: { type: mongoose.Schema.Types.ObjectId, ref: "Wallet", default: null },

        destinationAccountNumber: { type: String, required: true },
        destinationBank: { type: String, required: true },
        destinationAccountName: { type: String, default: "" },

        amount: { type: Number, required: true },
        currency: { type: String, default: "NGN" },

        status: {
            type: String,
            // "requires_review": set by the stuck-transfer recovery job
            // (src/jobs/recoverStuckTransfers.job.js) when a payout has
            // sat at "pending" past a threshold - i.e. the pool was
            // debited and then the process likely crashed/lost network
            // before the provider call resolved. This is a "we don't
            // know what happened, a human must check the provider
            // directly" state, not an automatic failure - blindly
            // reversing here would incorrectly return pool funds for a
            // payout that may have actually succeeded at the bank.
            enum: ["pending", "success", "failed", "reversed", "requires_review"],
            default: "pending"
        },

        providerReference: { type: String, default: null },
        failureReason: { type: String, default: null }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Payout", payoutSchema);
