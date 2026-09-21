// src/modules/adjustment/adjustment.model.js
//
// One row per admin-initiated manual correction to a wallet's balance.
// This is the ONLY sanctioned way to move a customer's ledger balance
// without a matching real-money event (a deposit, a transfer, a
// payout). It replaces the old, unsafe POST /api/v1/wallet/credit route
// (see wallet.controller.js's removal note) - same underlying need
// (put a number in a wallet without a real bank event behind it, e.g.
// for test/demo environments, or a genuine goodwill/error-correction
// credit in production), but done through a session + ledger entry +
// audit log + admin-key gate, with a required human-readable reason and
// a unique reference for idempotency, instead of a bare unauthenticated
// balance mutation.
//
// This intentionally has NO settlement-pool interaction. An adjustment
// changes what the wallet's ledger says the customer is owed; it does
// NOT claim that real bank-held money moved. That's exactly why it must
// stay rare, always require a reason, and always be "critical"-severity
// audit logged - every adjustment is, by definition, a place where the
// wallet ledger and the real settlement pool can drift, and that drift
// has to be visible and explainable, not just possible.

const mongoose = require("mongoose");

const adjustmentSchema = new mongoose.Schema(
    {
        // Caller-supplied (or admin-tool-generated) unique key so a
        // retried/double-clicked correction can never be applied twice.
        reference: { type: String, required: true, unique: true },

        wallet: { type: mongoose.Schema.Types.ObjectId, ref: "Wallet", required: true, index: true },

        direction: { type: String, enum: ["credit", "debit"], required: true },
        amount: { type: Number, required: true }, // always positive, integer-enforced in the service

        // Required, not optional - an adjustment with no stated reason
        // is exactly the kind of thing this module exists to prevent.
        reason: { type: String, required: true },

        // Free-text identifier of who authorized this (operator name/
        // email/ID). Not a substitute for real RBAC/maker-checker
        // (Phase 4/7 in the roadmap) - just makes today's single-shared-
        // key admin model at least attributable in the audit trail
        // until proper per-operator identity exists.
        performedBy: { type: String, default: null },

        status: {
            type: String,
            enum: ["applied", "failed"],
            default: "applied"
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Adjustment", adjustmentSchema);
