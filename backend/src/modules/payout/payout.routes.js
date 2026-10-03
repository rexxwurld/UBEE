const router = require("express").Router();
const controller = require("./payout.controller");
const verifyPartnerSignature = require("../../middleware/verifyPartnerSignature");
const validate = require("../../middleware/validate");
const { createPayoutBody } = require("./payout.validation");

// POST /api/v1/payouts - called by an onboarded partner (SwiftPay, or
// any other partner registered via src/modules/partner/). Which partner
// is verified from the request's own `linkedService` field - see
// verifyPartnerSignature.js.
//
// Signature verification MUST run before validate() - it checks the
// signature against the exact body as received, before any
// coercion/normalization validate() might apply (e.g. numeric-string
// amount -> number). Validating first and signing-checking second would
// verify a signature against a body that might not be byte-for-byte
// what the partner actually signed.
router.post("/", verifyPartnerSignature, validate({ body: createPayoutBody }), controller.createPayout);

module.exports = router;
