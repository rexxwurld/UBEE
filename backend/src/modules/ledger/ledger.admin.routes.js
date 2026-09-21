const router = require("express").Router();
const controller = require("./ledger.admin.controller");
const requireAdminAuth = require("../../middleware/requireAdminAuth");
const validate = require("../../middleware/validate");
const { getWalletLedgerParams, getWalletLedgerQuery } = require("./ledger.admin.validation");

router.get(
    "/:walletId/ledger",
    requireAdminAuth(["ops", "compliance", "support", "superadmin"]),
    validate({ params: getWalletLedgerParams, query: getWalletLedgerQuery }),
    controller.getWalletLedger
);

module.exports = router;
