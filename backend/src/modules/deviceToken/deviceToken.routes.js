const router = require("express").Router();
const controller = require("./deviceToken.controller");
const auth = require("../../middleware/auth");
const validate = require("../../middleware/validate");
const { registerBody, tokenParams } = require("./deviceToken.validation");

router.post("/devices", auth, validate({ body: registerBody }), controller.registerDevice);
router.delete("/devices/:token", auth, validate({ params: tokenParams }), controller.unregisterDevice);

module.exports = router;
