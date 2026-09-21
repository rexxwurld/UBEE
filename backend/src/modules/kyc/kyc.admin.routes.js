const router = require("express").Router();
const controller = require("./kyc.controller");
const requireAdminAuth = require("../../middleware/requireAdminAuth");
const validate = require("../../middleware/validate");
const { verifyBody, verifyParams } = require("./kyc.validation");

router.post(
    "/:userId/verify",
    requireAdminAuth(["compliance"]),
    validate({ params: verifyParams, body: verifyBody }),
    controller.verify
);

module.exports = router;
