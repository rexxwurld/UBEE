const router = require("express").Router();
const controller = require("./transaction.controller");
const auth = require("../../middleware/auth");
const validate = require("../../middleware/validate");
const { transferBody, historyQuery } = require("./transaction.validation");

// TRANSFER
router.get("/", auth, validate({ query: historyQuery }), controller.getHistory);
router.post("/transfer", auth, validate({ body: transferBody }), controller.transfer);

module.exports = router;
