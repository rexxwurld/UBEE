const router = require("express").Router();
const controller = require("./refund.controller");
const verifyPartnerSignature = require("../../middleware/verifyPartnerSignature");
const requireAdminAuth = require("../../middleware/requireAdminAuth");
const validate = require("../../middleware/validate");
const { createRefundBody, getRefundParams } = require("./refund.validation");

// Signature check before validation - same reasoning as payout.routes.js.
router.post("/", verifyPartnerSignature, validate({ body: createRefundBody }), controller.createRefund);

// Service-to-service/operator status check - read-only, so "support"
// role can access it too, not just "ops".
router.get(
    "/:reference",
    requireAdminAuth(["ops", "support"]),
    validate({ params: getRefundParams }),
    controller.getRefund
);

module.exports = router;
