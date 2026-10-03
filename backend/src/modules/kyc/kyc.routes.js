const router = require("express").Router();
const controller = require("./kyc.controller");
const auth = require("../../middleware/auth");
const validate = require("../../middleware/validate");
const { submitBody } = require("./kyc.validation");

router.post("/submit", auth, validate({ body: submitBody }), controller.submit);
router.get("/status", auth, controller.getStatus);

module.exports = router;
