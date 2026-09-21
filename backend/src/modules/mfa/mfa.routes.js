const router = require("express").Router();
const controller = require("./mfa.controller");
const auth = require("../../middleware/auth");
const validate = require("../../middleware/validate");
const { enableVerifyBody, disableBody } = require("./mfa.validation");

router.post("/enable", auth, controller.enable);
router.post("/enable/verify", auth, validate({ body: enableVerifyBody }), controller.enableVerify);
router.post("/disable", auth, validate({ body: disableBody }), controller.disable);

module.exports = router;
