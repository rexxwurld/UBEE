const router = require("express").Router();
const controller = require("./deposit.controller");
const requireAdminAuth = require("../../middleware/requireAdminAuth");
const validate = require("../../middleware/validate");
const { simulateDepositBody, resolveDepositBody, resolveDepositParams } = require("./deposit.validation");

// POST /api/v1/admin/deposits
router.post("/", requireAdminAuth(["ops"]), validate({ body: simulateDepositBody }), controller.simulateDeposit);

// GET /api/v1/admin/deposits/held
router.get("/held", requireAdminAuth(["ops", "support"]), controller.getHeldDeposits);

// POST /api/v1/admin/deposits/:id/resolve
router.post(
    "/:id/resolve",
    requireAdminAuth(["ops"]),
    validate({ params: resolveDepositParams, body: resolveDepositBody }),
    controller.resolveDeposit
);

module.exports = router;
