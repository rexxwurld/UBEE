// src/jobs/reconciliation.job.js
//
// Opt-in scheduler wrapping reconciliation.service.js's wallet/pool
// checks. Same opt-in philosophy as src/jobs/recoverStuckTransfers.job.js -
// running two instances of this app with this auto-started in every
// process just means redundant passes, so it's an explicit choice via
// RUN_RECONCILIATION_JOB=true, not automatic. A default 1-hour interval
// (vs the stuck-transfer job's 5 minutes) since a full wallet scan is a
// heavier operation and balance drift, unlike a stuck payout, isn't
// typically time-critical to catch within minutes - see the interval's
// own comment for the real scaling caveat.

const { reconcileWallets, reconcilePools } = require("../modules/reconciliation/reconciliation.service");

async function runOnce() {
    const [walletResult, poolResult] = await Promise.all([
        reconcileWallets(),
        reconcilePools()
    ]);

    const totalOpened = walletResult.opened + poolResult.opened;
    const totalResolved = walletResult.resolved + poolResult.resolved;

    if (totalOpened || totalResolved) {
        console.log(
            `[reconciliation_job] checked ${walletResult.checked} wallet(s) + ${poolResult.checked} pool check(s), ` +
            `opened ${totalOpened} new exception(s), auto-resolved ${totalResolved}`
        );
    }

    return { walletResult, poolResult };
}

function startScheduler(intervalMs = Number(process.env.RECONCILIATION_JOB_INTERVAL_MS || 60 * 60 * 1000)) {
    runOnce().catch((err) => console.error("[reconciliation_job] run failed:", err.message));
    return setInterval(() => {
        runOnce().catch((err) => console.error("[reconciliation_job] run failed:", err.message));
    }, intervalMs);
}

module.exports = { runOnce, startScheduler };
