const router = require("express").Router();
const controller = require("./accountState.controller");
const requireAdminAuth = require("../../middleware/requireAdminAuth");
const validate = require("../../middleware/validate");
const { updateStateBody, userIdParams } = require("./accountState.validation");

router.get("/:userId/state", requireAdminAuth(["compliance", "support", "ops"]), validate({ params: userIdParams }), controller.getState);
router.patch(
    "/:userId/state",
    requireAdminAuth(["compliance"]),
    validate({ params: userIdParams, body: updateStateBody }),
    controller.updateState
);

module.exports = router;
