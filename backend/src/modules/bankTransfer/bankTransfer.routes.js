const router = require("express").Router();
const controller = require("./bankTransfer.controller");
const auth = require("../../middleware/auth");
const validate = require("../../middleware/validate");
const { lookupLimiter } = require("../../middleware/rateLimiters");
const { nameEnquiryQuery, createBody } = require("./bankTransfer.validation");

router.get("/config", auth, controller.config);
router.get("/banks", auth, controller.banks);
router.get("/name-enquiry", auth, lookupLimiter, validate({ query: nameEnquiryQuery }), controller.nameEnquiry);
router.post("/", auth, validate({ body: createBody }), controller.create);

module.exports = router;
