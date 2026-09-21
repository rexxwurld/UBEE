// src/modules/partner/partner.model.js
//
// A "Partner" is any external platform connected to RexxPay the way
// SwiftPay is today - it gets its own settlement pool, its own pool
// wallets, its own webhook destination, and (critically) its own
// signing secret, rather than everything being hardcoded to one
// service named "swiftpay" (see §21 of the audit for the reasoning).
//
// `slug` is the value that used to be the hardcoded string "swiftpay"
// scattered through Wallet.linkedService / SettlementPool.linkedService
// - those fields keep the same name and shape (a String) for backward
// compatibility with every existing service function that reads them,
// but they're no longer restricted to one literal value by a schema
// enum; they're validated against a live Partner record instead (see
// partner.service.js:assertPartnerActive).

const mongoose = require("mongoose");

const partnerSchema = new mongoose.Schema(
    {
        name: { type: String, required: true }, // display name, e.g. "SwiftPay"

        // The identifier used everywhere else in the codebase
        // (Wallet.linkedService, SettlementPool.linkedService,
        // payout/refund's `linkedService` body field). Lowercase,
        // no spaces - a URL/body-safe slug, not the display name.
        slug: { type: String, required: true, unique: true, lowercase: true, trim: true },

        status: {
            type: String,
            enum: ["active", "suspended"],
            default: "active"
        },

        // Where this partner's deposit-notification webhooks get sent.
        webhookUrl: { type: String, required: true },

        // Current signing/verification secret for this partner. Used to
        // sign OUTBOUND webhooks to them (deposit notifications) and to
        // verify INBOUND requests FROM them (payout/refund instructions).
        // Same symmetric-secret pattern the original SwiftPay integration
        // used, just no longer shared across every partner - each
        // partner gets their own, so one partner can never forge
        // requests as another.
        webhookSecret: { type: String, required: true },

        // Secret-rotation support: during a rotation grace window, both
        // the new (webhookSecret) and previous secret are accepted for
        // INBOUND verification, so a partner rotating their own secret
        // doesn't get a hard cutover with no overlap window. Outbound
        // signing always uses the current webhookSecret only.
        previousWebhookSecret: { type: String, default: null },
        previousSecretExpiresAt: { type: Date, default: null },

        contactEmail: { type: String, default: null },
        notes: { type: String, default: null }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Partner", partnerSchema);
