const app = require("./app");
const connectDB = require("./config/db");
const env = require("./config/env");
const { startScheduler } = require("./jobs/recoverStuckTransfers.job");
const { startScheduler: startReconciliationScheduler } = require("./jobs/reconciliation.job");
const { ensurePartnerFromEnv } = require("./modules/partner/partner.service");

async function start() {
    await connectDB(env.MONGO_URI);

    // Seeds a first-class Partner record for the original SwiftPay
    // integration from the legacy global env vars, if one doesn't
    // already exist - see partner.service.js:ensurePartnerFromEnv. This
    // is what makes the Phase 3a multi-partner refactor a transparent
    // upgrade: SwiftPay keeps working exactly as before, now backed by
    // a real Partner record instead of hardcoded env/enum values,
    // without requiring a manual migration step.
    try {
        const seeded = await ensurePartnerFromEnv({
            slug: "swiftpay",
            name: "SwiftPay",
            webhookUrl: env.SWIFTPAY_WEBHOOK_URL,
            webhookSecret: env.SWIFTPAY_WEBHOOK_SECRET
        });
        if (seeded) console.log(`[partner] seeded Partner record for "swiftpay" from environment config`);
    } catch (err) {
        console.error("[partner] failed to seed swiftpay Partner record:", err.message);
    }

    // Opt-in stuck-transfer recovery job - see src/jobs/recoverStuckTransfers.job.js
    // for why this stays opt-in and what it actually does. Set
    // RUN_RECOVERY_JOB=true in the environment to enable it.
    if (env.RUN_RECOVERY_JOB) {
        startScheduler();
        console.log("[recovery_job] scheduler started");
    }

    // Opt-in reconciliation job - see src/jobs/reconciliation.job.js.
    // Set RUN_RECONCILIATION_JOB=true in the environment to enable it.
    if (env.RUN_RECONCILIATION_JOB) {
        startReconciliationScheduler();
        console.log("[reconciliation_job] scheduler started");
    }

    app.listen(env.PORT, () => {
        console.log(`Server running on port ${env.PORT}`);
    });
}

start();