// src/modules/dispute/dispute.model.js
//
// Closes the audit's §10 gap: "no dispute-handling workflow." A
// customer raises a dispute against something they saw happen to their
// account (a transfer they don't recognize, a deposit that never
// landed, etc); an operator investigates and resolves it. Deliberately
// NOT wired to automatically reverse/adjust anything - resolving a
// dispute in the customer's favor is a decision an operator makes
// explicitly (via the existing Adjustment/maker-checker flow if money
// needs to move), not something this model does on its own. A dispute
// record is evidence and a workflow state, not a transaction.

const mongoose = require("mongoose");

const disputeSchema = new mongoose.Schema(
    {
        reference: { type: String, required: true, unique: true },

        raisedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

        // What this dispute is about, if the customer can point to a
        // specific record - optional because a customer might be
        // disputing something more general ("my balance looks wrong")
        // without one specific transaction in mind.
        relatedType: {
            type: String,
            enum: ["transaction", "deposit", "payout", "refund", "other"],
            default: "other"
        },
        relatedEntityRef: { type: String, default: null },

        subject: { type: String, required: true, maxlength: 200 },
        description: { type: String, required: true, maxlength: 5000 },

        status: {
            type: String,
            enum: ["open", "investigating", "resolved", "rejected"],
            default: "open"
        },

        assignedTo: { type: String, default: null }, // admin username
        resolutionNotes: { type: String, default: null },
        resolvedAt: { type: Date, default: null },
        resolvedBy: { type: String, default: null }
    },
    { timestamps: true }
);

disputeSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model("Dispute", disputeSchema);
