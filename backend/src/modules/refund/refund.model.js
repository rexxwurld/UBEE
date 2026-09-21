const mongoose = require("mongoose");

const refundSchema = new mongoose.Schema(
  {
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    reference: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    pool: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SettlementPool",
      required: true,
      index: true,
    },

    merchant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Merchant",
      required: false,
    },

    linkedService: {
      type: String,
      default: "swiftpay",
    },

    originalBankReference: {
      type: String,
      required: true,
      index: true,
    },

    destinationAccountNumber: {
      type: String,
      required: true,
    },

    destinationBank: {
      type: String,
      required: true,
    },

    destinationAccountName: {
      type: String,
      default: null,
    },

    amount: {
      type: Number,
      required: true,
      min: 1,
    },

    currency: {
      type: String,
      default: "NGN",
      uppercase: true,
    },

    status: {
      type: String,
      enum: [
        "pending",
        "processing",
        "successful",
        "failed",
        "reversed",
        // Set by the stuck-transfer recovery job when a refund sits at
        // "pending"/"processing" past a threshold with no resolution -
        // see the matching comment on Payout's status enum for why
        // this is a "needs a human to check the provider" state rather
        // than an automatic failure.
        "requires_review",
      ],
      default: "pending",
      index: true,
    },

    providerRef: {
      type: String,
      default: null,
      index: true,
    },

    failureReason: {
      type: String,
      default: null,
    },

    processedAt: {
      type: Date,
      default: null,
    },

    reversedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Refund", refundSchema);
