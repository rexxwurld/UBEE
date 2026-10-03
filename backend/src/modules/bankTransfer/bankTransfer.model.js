const mongoose = require("mongoose");

// One row per customer-initiated transfer to another bank.
//   pending         wallet already debited, provider not answered yet
//   success         provider ACCEPTED the instruction (same meaning as
//                   payouts: accepted, not confirmed-landed - see
//                   providers/bankProvider.interface.js)
//   failed          provider refused (or confirmed failure); money returned
//   requires_review provider outcome unknown (timeout etc.). Money stays
//                   debited and is NEVER auto-reversed on ambiguity - the
//                   recovery job / an operator resolves it.
const bankTransferSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    idempotencyKey: { type: String, required: true },

    amount: { type: Number, required: true },   // what the recipient gets
    fee: { type: Number, default: 0 },          // charged on top; total debit = amount + fee

    destinationAccountNumber: { type: String, required: true },
    destinationBankCode: { type: String, required: true },
    destinationBankName: { type: String, default: "" },
    destinationAccountName: { type: String, default: "" }, // from the provider's name enquiry, server-side
    description: { type: String, default: "" },

    status: { type: String, enum: ["pending", "success", "failed", "requires_review"], default: "pending", index: true },
    providerReference: { type: String, default: null },
    failureReason: { type: String, default: null },

    // The customer-facing history row (Transaction) this transfer shows up as.
    transaction: { type: mongoose.Schema.Types.ObjectId, ref: "Transaction", default: null }
}, { timestamps: true });

// A retried request (double tap, flaky network) can never create two transfers.
bankTransferSchema.index({ user: 1, idempotencyKey: 1 }, { unique: true });
bankTransferSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("BankTransfer", bankTransferSchema);
