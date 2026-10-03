const router = require("express").Router();
const controller = require("./bank.controller");
const requireAdminAuth = require("../../middleware/requireAdminAuth");
const validate = require("../../middleware/validate");
const { nameEnquiryQuery } = require("./bank.validation");

// Gated to admin roles for now (ops build/verify payout instructions;
// support needs read access for investigation) since there's no
// partner-facing "pre-check before submitting a payout" API surface
// yet - partners currently submit payout/refund instructions directly.
// A partner-facing version of these (behind verifyPartnerSignature
// instead) is a reasonable future addition once a partner actually asks
// for it.
router.get("/", requireAdminAuth(["ops", "support", "superadmin"]), controller.listBanks);
router.get(
    "/name-enquiry",
    requireAdminAuth(["ops", "support", "superadmin"]),
    validate({ query: nameEnquiryQuery }),
    controller.nameEnquiry
);

module.exports = router;
