const router = require("express").Router();
const controller = require("./admin.controller");
const requireAdminAuth = require("../../middleware/requireAdminAuth");
const validate = require("../../middleware/validate");
const {
    createPoolAccountBody,
    poolStatusQuery,
    accountNumberParams,
    assignBody,
    settlementExportQuery
} = require("./admin.validation");

// Pool/account provisioning and reporting - day-to-day money
// operations, role "ops" (or superadmin, which always passes - see
// requireAdminAuth.js). Legacy x-admin-key still works as a fallback
// during migration - see that middleware's comment.

// POST /api/v1/admin/pool-accounts
router.post(
    "/pool-accounts",
    requireAdminAuth(["ops"]),
    validate({ body: createPoolAccountBody }),
    controller.createPoolAccount
);

// GET /api/v1/admin/pool-status
router.get(
    "/pool-status",
    requireAdminAuth(["ops", "support"]),
    validate({ query: poolStatusQuery }),
    controller.getPoolStatus
);

// PATCH /api/v1/admin/pool-accounts/:accountNumber/assign
router.patch(
    "/pool-accounts/:accountNumber/assign",
    requireAdminAuth(["ops"]),
    validate({ params: accountNumberParams, body: assignBody }),
    controller.assignPoolAccount
);

// PATCH /api/v1/admin/pool-accounts/:accountNumber/deactivate
router.patch(
    "/pool-accounts/:accountNumber/deactivate",
    requireAdminAuth(["ops"]),
    validate({ params: accountNumberParams }),
    controller.deactivatePoolAccount
);

// PATCH /api/v1/admin/pool-accounts/:accountNumber/release
router.patch(
    "/pool-accounts/:accountNumber/release",
    requireAdminAuth(["ops"]),
    validate({ params: accountNumberParams }),
    controller.releasePoolAccount
);

// GET /api/v1/admin/settlement-export?from=&to=
router.get(
    "/settlement-export",
    requireAdminAuth(["ops", "support"]),
    validate({ query: settlementExportQuery }),
    controller.getSettlementExport
);

module.exports = router;
