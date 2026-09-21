const dotenv = require("dotenv");
dotenv.config({ path: require("path").resolve(__dirname, "../../.env") });

module.exports = {
    PORT: process.env.PORT,
    MONGO_URI: process.env.MONGO_URI,
    JWT_SECRET: process.env.JWT_SECRET,
    NODE_ENV: process.env.NODE_ENV || "development",

    // Shared with SwiftPay - must match exactly on both services.
    // Used to sign outgoing webhooks (deposit notifications) AND to verify
    // incoming requests from SwiftPay (payout instructions). Same secret,
    // both directions.
    SWIFTPAY_WEBHOOK_SECRET: process.env.SWIFTPAY_WEBHOOK_SECRET || process.env.BANK_WEBHOOK_SECRET,

    // Where SwiftPay's webhook receiver lives (deposit notifications go here).
    SWIFTPAY_WEBHOOK_URL:
        process.env.SWIFTPAY_WEBHOOK_URL ||
        process.env.REXXPAY_INFRA_WEBHOOK_URL ||
        "https://checkout-rexxpay.onrender.com/api/webhooks/bank",

    // Required header (x-admin-key) - now ONLY used to bootstrap the
    // first AdminUser account (see adminUser.service.js). Per-request
    // admin auth should use a real AdminUser + JWT after that - see
    // middleware/requireAdminAuth.js.
    ADMIN_KEY: process.env.ADMIN_KEY,

    // Separate secret from JWT_SECRET (customer tokens) deliberately -
    // a leaked customer-auth secret must never be usable to forge an
    // admin token, and vice versa.
    ADMIN_JWT_SECRET: process.env.ADMIN_JWT_SECRET,

    // Set to "true" once real AdminUser accounts are onboarded, to stop
    // accepting the legacy shared x-admin-key for ordinary admin
    // requests entirely (bootstrap still works even with this set,
    // since bootstrap is meant to be how you get your first AdminUser
    // in the first place).
    DISABLE_LEGACY_ADMIN_KEY: process.env.DISABLE_LEGACY_ADMIN_KEY === "true",

    // Set to "true" once the maker-checker approval flow
    // (src/modules/approval/) is in active use, to stop accepting
    // direct calls to POST /api/v1/admin/adjustments entirely - forcing
    // every balance adjustment through request+approve-by-a-different-
    // admin instead of a single admin being able to move money
    // unilaterally. Off by default so nothing breaks before you've
    // actually onboarded a second admin able to act as checker.
    REQUIRE_MAKER_CHECKER: process.env.REQUIRE_MAKER_CHECKER === "true",

    // Opt-in switch for the stuck-transfer recovery job - see
    // src/jobs/recoverStuckTransfers.job.js.
    RUN_RECOVERY_JOB: process.env.RUN_RECOVERY_JOB === "true",

    // Opt-in switch for the automated reconciliation job - see
    // src/jobs/reconciliation.job.js.
    RUN_RECONCILIATION_JOB: process.env.RUN_RECONCILIATION_JOB === "true"
};
