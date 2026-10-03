// src/modules/deposit/deposit.model.js
//
// One row per external deposit landing on a Wallet (virtual account).
// `reference` is whatever unique ID the money-in event carries - the
// unique index on it is what makes deposit processing idempotent.

const mongoose = require("mongoose");

const depositSchema = new mongoose.Schema(
    {
        reference: { type: String, required: true, unique: true },

        wallet: { type: mongoose.Schema.Types.ObjectId, ref: "Wallet", required: true, index: true },
        pool: { type: mongoose.Schema.Types.ObjectId, ref: "SettlementPool", required: true },

        amount: { type: Number, required: true },
        currency: { type: String, default: "NGN" },

        status: {
            type: String,
            // "held": the deposit amount didn't match what was expected
            // (wallet.expectedAmount) for the virtual account it landed
            // on. Previously this case was hard-rejected - nothing was
            // persisted at all, even though the money is genuinely
            // sitting at the real bank. That left real, received funds
            // completely invisible to RexxPay with no record to
            // reconcile against. Now it's persisted as "held" so an
            // admin can see it (GET /api/v1/admin/deposits/held) and
            // resolve it (POST /api/v1/admin/deposits/:id/resolve) -
            // either crediting it at the amount actually received, or
            // rejecting it, both explicitly and with an audit trail,
            // instead of it just disappearing from view.
            enum: ["pending", "confirmed", "failed", "held"],
            default: "pending"
        },

        // Only set when status is "held" - why this deposit didn't
        // auto-credit, so an admin isn't reverse-engineering it from
        // rawPayload.
        holdReason: { type: String, default: null },

        // Set once a "held" deposit is resolved by an admin (credited
        // or rejected) - who/when, for the audit trail.
        resolvedAt: { type: Date, default: null },
        resolvedBy: { type: String, default: null },

        rawPayload: { type: mongoose.Schema.Types.Mixed, default: null }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Deposit", depositSchema);
