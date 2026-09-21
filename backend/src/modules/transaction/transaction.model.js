const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
    // Client-supplied (or auto-generated) key so a retried "transfer"
    // request - e.g. the user double-tapping "send" on a slow connection -
    // can never create two real transfers. Sparse so old rows without one
    // don't collide.
    idempotencyKey: {
        type: String,
        default: null
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
    receiver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
    amount: {
        type: Number,
        required: true
    },
    description: {
        type: String,
        default: ""
    },
    bank: {
        type: String,
        default: ""
    },
    accountNumber: {
        type: String,
        default: ""
    },
    type: {
        type: String,
        enum: ["transfer", "credit", "debit"],
        default: "transfer"
    },
    status: {
        type: String,
        enum: ["success", "failed", "pending"],
        default: "success"
    }
}, { timestamps: true });

transactionSchema.index(
    { idempotencyKey: 1 },
    { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } }
);

// FOUND WHILE WORKING ON PHASE 7 (flagged in the original audit's §14
// but not fixed until now): no index existed on `sender` at all, despite
// transaction.service.js's own daily-limit check running an aggregation
// on exactly {sender, type, status, createdAt} on EVERY SINGLE TRANSFER -
// a full collection scan on the system's own hottest query path, not
// just an admin-search convenience. Also indexing `receiver` for the
// admin transaction-search/investigation endpoints added in Phase 7.
transactionSchema.index({ sender: 1, createdAt: -1 });
transactionSchema.index({ receiver: 1, createdAt: -1 });
transactionSchema.index({ accountNumber: 1, createdAt: -1 });

module.exports = mongoose.model("Transaction", transactionSchema);