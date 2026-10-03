const router = require("express").Router();
const controller = require("./approval.controller");
const requireAdminAuth = require("../../middleware/requireAdminAuth");
const validate = require("../../middleware/validate");
const { createRequestBody, idParams, rejectBody } = require("./approval.validation");

// Deliberately: the role that can REQUEST (ops) is different from the
// role that can APPROVE/REJECT (compliance) - "ops" is excluded from
// approve/reject entirely, so a single compromised or malicious ops
// account cannot both request and approve its own adjustment even by
// routing through two different ops staff. superadmin can do both (it
// can do everything), but the requestedBy !== performedBy check in
// approval.service.js still stops the exact same person from approving
// their own request even as superadmin.
router.post("/", requireAdminAuth(["ops"]), validate({ body: createRequestBody }), controller.create);
router.get("/", requireAdminAuth(["ops", "compliance", "support"]), controller.list);
router.post("/:id/approve", requireAdminAuth(["compliance"]), validate({ params: idParams }), controller.approve);
router.post(
    "/:id/reject",
    requireAdminAuth(["compliance"]),
    validate({ params: idParams, body: rejectBody }),
    controller.reject
);

module.exports = router;
