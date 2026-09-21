const { applyAdjustment } = require("./adjustment.service");
const env = require("../../config/env");

// POST /api/v1/admin/adjustments
// Header: Authorization: Bearer <admin token>, role "ops" (see
// adjustment.routes.js) - or legacy x-admin-key.
// Body: { accountNumber, direction: "credit"|"debit", amount, reference, reason, performedBy? }
//
// Replaces the old POST /api/v1/wallet/credit route. Ledgered,
// idempotent on `reference`, and requires a human-readable `reason` -
// see adjustment.model.js for why all of that matters here specifically.
//
// When REQUIRE_MAKER_CHECKER is enabled (env.js), this route stops
// executing adjustments directly and instead tells the caller to use
// the maker-checker approval flow (src/modules/approval/) - one admin
// requests it, a DIFFERENT admin approves it, and approval.service.js
// calls applyAdjustment() itself once approved. The underlying function
// doesn't change; only whether this specific HTTP route is allowed to
// invoke it unilaterally.
exports.createAdjustment = async (req, res) => {
    try {
        if (env.REQUIRE_MAKER_CHECKER) {
            return res.status(403).json({
                status: false,
                message: "direct_adjustments_disabled_use_approval_flow",
                hint: "POST /api/v1/admin/approvals with { type: \"adjustment\", payload: {...}, requestReason }"
            });
        }

        const { accountNumber, direction, amount, reference, reason, performedBy } = req.body;

        const result = await applyAdjustment({
            accountNumber,
            direction,
            amount,
            reference,
            reason,
            performedBy
        });

        res.status(result.duplicate ? 200 : 201).json({
            status: true,
            duplicate: result.duplicate,
            data: result.adjustment
        });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};
