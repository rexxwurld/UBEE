const router = require("express").Router();
const controller = require("./reconciliation.controller");
const requireAdminAuth = require("../../middleware/requireAdminAuth");
const validate = require("../../middleware/validate");
const { listExceptionsQuery, resolveExceptionBody, idParams } = require("./reconciliation.validation");

router.get("/exceptions", requireAdminAuth(["ops", "compliance", "support", "superadmin"]), validate({ query: listExceptionsQuery }), controller.listExceptions);
router.post(
    "/exceptions/:id/resolve",
    requireAdminAuth(["ops", "compliance"]),
    validate({ params: idParams, body: resolveExceptionBody }),
    controller.resolveException
);
router.post("/run", requireAdminAuth(["ops", "superadmin"]), controller.runNow);

module.exports = router;
