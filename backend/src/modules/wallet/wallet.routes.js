const router = require("express").Router();
const controller = require("./wallet.controller");
const auth = require("../../middleware/auth");
const { lookupLimiter } = require("../../middleware/rateLimiters");

// GET WALLET
router.get("/", auth, controller.getWallet);

// Recipient name check before sending (the "is this the right person?"
// step). Authenticated + rate limited - see rateLimiters.js:lookupLimiter.
router.get("/lookup/:accountNumber", auth, lookupLimiter, controller.lookup);

// The old POST /credit "test only" route has been removed - see
// wallet.controller.js and src/modules/adjustment/ for why and what
// replaced it.

module.exports = router;
