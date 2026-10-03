const { createPoolWallet, getPoolStatus, assignPoolAccount, deactivatePoolAccount, releasePoolAccount, getSettlementExport } = require("./admin.service");

// Creates a real bank wallet for a partner's account pool and returns
// its real account number. Called by you (manually, or from a partner's
// provisioning code) with the x-admin-key header - never by end users.
//
// GENERALIZED (Phase 3a): accepts an optional linkedService (partner
// slug) in the body, defaulting to "swiftpay" - existing callers that
// don't send it get exactly the same behavior as before.
exports.createPoolAccount = async (req, res) => {
    try {
        const { label, linkedService } = req.body;
        const account = await createPoolWallet(label, linkedService || "swiftpay", req.admin.username);

        res.status(201).json({
            status: true,
            data: account
        });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};

// GET /api/v1/admin/pool-status?linkedService=swiftpay
// Quick sanity check: pool balance vs sum of linked wallet balances.
// Defaults to "swiftpay" for backward compatibility - for a fuller,
// partner-branded version of this same check, see
// GET /api/v1/admin/partners/:slug/pool-health.
exports.getPoolStatus = async (req, res) => {
    try {
        const status = await getPoolStatus(req.query.linkedService || "swiftpay");
        res.json({ status: true, data: status });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};

// PATCH /api/v1/admin/pool-accounts/:accountNumber/assign
// Called by SwiftPay right after it hands this account out to a customer.
exports.assignPoolAccount = async (req, res) => {
    try {
        const { accountNumber } = req.params;
        const { expectedAmount } = req.body;
        const result = await assignPoolAccount(accountNumber, expectedAmount, req.admin.username);
        res.json({ status: true, data: result });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};

// PATCH /api/v1/admin/pool-accounts/:accountNumber/deactivate
// Called by SwiftPay when a checkout on this account finishes and it
// enters cooldown - not back in the pool yet, so deposits still reject.
exports.deactivatePoolAccount = async (req, res) => {
    try {
        const { accountNumber } = req.params;
        const result = await deactivatePoolAccount(accountNumber, req.admin.username);
        res.json({ status: true, data: result });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};

// PATCH /api/v1/admin/pool-accounts/:accountNumber/release
// Called by SwiftPay once the account is back in its own available pool.
exports.releasePoolAccount = async (req, res) => {
    try {
        const { accountNumber } = req.params;
        const result = await releasePoolAccount(accountNumber, req.admin.username);
        res.json({ status: true, data: result });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};

// GET /api/v1/admin/settlement-export?from=2026-08-16&to=2026-08-17&linkedService=swiftpay
// Called by a partner's reconcile job (via a small fetch wrapper) to pull
// the day's confirmed deposits and compare against its own Transaction
// records. from/to are optional ISO date strings; linkedService defaults
// to "swiftpay" for backward compatibility.
exports.getSettlementExport = async (req, res) => {
    try {
        const { from, to, linkedService } = req.query;
        const rows = await getSettlementExport({ from, to, linkedService: linkedService || "swiftpay" });
        res.json({ status: true, count: rows.length, data: rows });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};
