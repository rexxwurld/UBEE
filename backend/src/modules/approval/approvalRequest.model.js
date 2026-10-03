// src/modules/approval/approvalRequest.model.js
//
// Generic maker-checker (dual-authorization) workflow. One admin (the
// "maker") requests a privileged action; a DIFFERENT admin (the
// "checker") must approve it before it actually executes - see
// approval.service.js's enforcement that maker !== checker.
//
// Currently wired to exactly one action type ("adjustment" - direct
// balance corrections, the single highest-risk admin capability in the
// system per the audit, since it moves a customer's ledger balance
// without a matching external cash movement). The `type` enum and the
// dispatch table in approval.service.js are exactly where to add more
// action types (e.g. account closure, partner secret rotation) as this
// pattern gets extended - the request/approve/reject/execute shape
// here doesn't need to change per type, only the dispatch table entry.

const mongoose = require("mongoose");

const approvalRequestSchema = new mongoose.Schema(
    {
        type: {
            type: String,
            enum: ["adjustment"], // extend here as more actions adopt maker-checker
            required: true
        },
        payload: { type: mongoose.Schema.Types.Mixed, required: true }, // the args the underlying service call needs

        requestedBy: { type: String, required: true }, // maker
        requestReason: { type: String, required: true },

        status: {
            type: String,
            enum: ["pending", "approved", "rejected"],
            default: "pending"
        },

        decidedBy: { type: String, default: null }, // checker
        decidedAt: { type: Date, default: null },
        rejectionReason: { type: String, default: null },

        // Once approved and executed, the id of whatever the underlying
        // service call produced (e.g. the resulting Adjustment._id) -
        // lets an operator trace an approval request through to its
        // real-world effect.
        resultRef: { type: String, default: null }
    },
    { timestamps: true }
);

module.exports = mongoose.model("ApprovalRequest", approvalRequestSchema);
