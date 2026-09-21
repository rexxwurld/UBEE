const Wallet = require("../wallet/wallet.model");
const generateAccountNumber = require("../../utils/generateAccountNumber");
const { getPoolByService, createPool } = require("../settlement/settlementPool.service");
const { assertPartnerActive } = require("../partner/partner.service");
const auditLog = require("../audit/auditLog.service");

// Creates a real virtual account (a Wallet row with a real, unique account
// number), linked to a partner's SettlementPool so incoming deposits are
// recognized as belonging to that pool rather than a normal end-user
// account. No User is created or needed - userId stays null since this
// account isn't owned by any real person.
//
// GENERALIZED (Phase 3a): linkedService used to be hardcoded to
// "swiftpay" everywhere in this function. It's now a parameter,
// defaulting to "swiftpay" so every EXISTING caller (admin.controller.js
// not passing one) behaves exactly as before. Validated against a real,
// active Partner record (src/modules/partner/) before a pool/wallet
// gets created for it - a typo'd or unregistered partner slug now fails
// loudly here instead of silently creating an orphaned pool that
// nothing can ever resolve a webhook URL/secret for.
//
// Idempotent on the pool itself: if a pool already exists for this
// partner, this wallet links to it instead of creating a second,
// disconnected pool.
async function createPoolWallet(label, linkedService = "swiftpay", performedBy = null) {
    await assertPartnerActive(linkedService);

    let pool = await getPoolByService(linkedService);
    if (!pool) {
        pool = await createPool({ label: label || `${linkedService} Settlement Pool`, linkedService });
    }

    const accountNumber = await generateAccountNumber();

    const wallet = await Wallet.create({
        accountNumber,
        balance: 0,
        linkedService,
        pool: pool._id
    });

    // FOUND WHILE WORKING ON PHASE 7 (flagged in the original audit's
    // §15 but not fixed until now): none of this file's four pool-
    // account lifecycle functions were audit-logged at all, despite
    // being privileged, money-adjacent operations - "no audit event at
    // all for admin pool-account actions." Added here and to
    // assignPoolAccount/deactivatePoolAccount/releasePoolAccount below.
    await auditLog.record({
        actorType: "admin",
        actorRef: performedBy || "unknown_admin",
        action: "admin.pool_wallet_created",
        entityType: "Wallet",
        entityRef: wallet._id.toString(),
        severity: "warning",
        metadata: { accountNumber, linkedService, poolId: pool._id.toString() }
    });

    return {
        accountNumber: wallet.accountNumber,
        walletId: wallet._id,
        poolId: pool._id,
        linkedService
    };
}

// GENERALIZED (Phase 3a): linkedService parameter, defaults to
// "swiftpay" for exact backward compatibility with the existing
// GET /api/v1/admin/pool-status route. For a per-partner version, see
// partner.service.js:getPartnerPoolHealth (mounted at
// GET /api/v1/admin/partners/:slug/pool-health), which is the same
// comparison generalized to any partner.
async function getPoolStatus(linkedService = "swiftpay") {
    const pool = await getPoolByService(linkedService);
    if (!pool) throw new Error(`no_pool_exists_yet_for_partner: ${linkedService}`);

    const wallets = await Wallet.find({ pool: pool._id });
    const walletBalanceSum = wallets.reduce((sum, w) => sum + w.balance, 0);

    return {
        pool,
        walletCount: wallets.length,
        walletBalanceSum,
        inSync: walletBalanceSum <= pool.poolBalance
    };
}

// Called by a partner right after it hands a pool account out to a
// customer for a checkout. Flips our side's status flag to match, so
// deposit.service.js's assigned-only check actually reflects reality
// instead of every pool wallet sitting at "available" forever.
//
// GENERALIZED (Phase 3a): the lookup used to require
// linkedService: "swiftpay" in the query filter. accountNumber is
// already globally unique (schema-level unique index), so that filter
// was never load-bearing for correctness - just relaxed to "any pool
// wallet" (wallet.linkedService truthy) so this works for any partner's
// pool accounts uniformly, without needing a linkedService argument
// threaded through every admin route.
async function assignPoolAccount(accountNumber, expectedAmount, performedBy = null) {
    const wallet = await Wallet.findOne({ accountNumber });
    if (!wallet || !wallet.linkedService) throw new Error("pool_account_not_found");

    wallet.status = "assigned";
    wallet.expectedAmount = expectedAmount ?? null;
    await wallet.save();

    await auditLog.record({
        actorType: "admin",
        actorRef: performedBy || "unknown_admin",
        action: "admin.pool_account_assigned",
        entityType: "Wallet",
        entityRef: wallet._id.toString(),
        metadata: { accountNumber, expectedAmount: wallet.expectedAmount }
    });

    return { accountNumber: wallet.accountNumber, status: wallet.status, expectedAmount: wallet.expectedAmount };
}

// Called by a partner right after a checkout on this account completes
// (or when it starts a cooldown for any other reason). The account isn't
// back in the partner's available pool yet, so it should still reject
// deposits the same as "assigned" - this just makes that state visible
// and honest in the bank's own records instead of leaving it saying
// "assigned" for a checkout that's actually already over.
async function deactivatePoolAccount(accountNumber, performedBy = null) {
    const wallet = await Wallet.findOne({ accountNumber });
    if (!wallet || !wallet.linkedService) throw new Error("pool_account_not_found");

    wallet.status = "deactivated";
    await wallet.save();

    await auditLog.record({
        actorType: "admin",
        actorRef: performedBy || "unknown_admin",
        action: "admin.pool_account_deactivated",
        entityType: "Wallet",
        entityRef: wallet._id.toString(),
        metadata: { accountNumber }
    });

    return { accountNumber: wallet.accountNumber, status: wallet.status };
}

// Called by a partner once a virtual account's payment is done (or the
// checkout it was holding is abandoned/stale) and it's handing the
// account back to its own available pool. This just flips our side's
// status flag to match, for audit/dashboard purposes - it does NOT
// touch balance or the pool; the wallet's accumulated balance stays put
// and keeps counting toward the settlement pool regardless of status.
async function releasePoolAccount(accountNumber, performedBy = null) {
    const wallet = await Wallet.findOne({ accountNumber });
    if (!wallet || !wallet.linkedService) throw new Error("pool_account_not_found");

    wallet.status = "available";
    await wallet.save();

    await auditLog.record({
        actorType: "admin",
        actorRef: performedBy || "unknown_admin",
        action: "admin.pool_account_released",
        entityType: "Wallet",
        entityRef: wallet._id.toString(),
        metadata: { accountNumber }
    });

    return { accountNumber: wallet.accountNumber, status: wallet.status };
}

// Called by a partner's reconcile job to compare its own Transaction
// records against what actually settled here. Returns one row per
// confirmed deposit on that partner's pool wallets within the given
// date range, shaped to match the bankReference the partner already
// stores (see deposit.service.js's notifyPartnerOfDeposit: bankReference
// is always `rxpbank_<deposit._id>`) so the two sides can be matched 1:1
// without the partner needing to know anything about our internal
// Deposit schema.
//
// GENERALIZED (Phase 3a): linkedService parameter, defaults to
// "swiftpay" for exact backward compatibility with the existing
// GET /api/v1/admin/settlement-export route.
async function getSettlementExport({ from, to, linkedService = "swiftpay" } = {}) {
    const Deposit = require("../deposit/deposit.model");

    const match = { status: "confirmed" };
    if (from || to) {
        match.createdAt = {};
        if (from) match.createdAt.$gte = new Date(from);
        if (to) match.createdAt.$lte = new Date(to);
    }

    const deposits = await Deposit.find(match)
        .populate("wallet", "accountNumber linkedService")
        .sort({ createdAt: 1 });

    return deposits
        .filter((d) => d.wallet && d.wallet.linkedService === linkedService)
        .map((d) => ({
            bankReference: `rxpbank_${d._id.toString()}`,
            depositReference: d.reference,
            accountNumber: d.wallet.accountNumber,
            amount: d.amount,
            currency: d.currency,
            settledAt: d.createdAt
        }));
}

module.exports = { createPoolWallet, getPoolStatus, assignPoolAccount, deactivatePoolAccount, releasePoolAccount, getSettlementExport };
