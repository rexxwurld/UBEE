const router = require("express").Router();
const controller = require("./wallet.controller");
const auth = require("../../middleware/auth");

// GET WALLET
router.get("/", auth, controller.getWallet);

// The old POST /credit "test only" route has been removed - see
// wallet.controller.js and src/modules/adjustment/ for why and what
// replaced it.

module.exports = router;
