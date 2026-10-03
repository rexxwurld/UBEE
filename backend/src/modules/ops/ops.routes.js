const controller = require("./ops.controller");
const requireAdminAuth = require("../../middleware/requireAdminAuth");
const validate = require("../../middleware/validate");
const {
    searchCustomersQuery,
    userIdParams,
    searchTransactionsQuery,
    transactionIdParams
} = require("./ops.validation");

const READ_ROLES = ["ops", "compliance", "support", "superadmin"];

// Mounted twice from app.js under two different base paths
// (/api/v1/admin/customers and /api/v1/admin/transactions) - see
// exports below.

const customerRouter = require("express").Router();
customerRouter.get("/search", requireAdminAuth(READ_ROLES), validate({ query: searchCustomersQuery }), controller.searchCustomers);
customerRouter.get("/:userId", requireAdminAuth(READ_ROLES), validate({ params: userIdParams }), controller.getCustomerProfile);

const transactionRouter = require("express").Router();
transactionRouter.get("/search", requireAdminAuth(READ_ROLES), validate({ query: searchTransactionsQuery }), controller.searchTransactions);
transactionRouter.get("/:id", requireAdminAuth(READ_ROLES), validate({ params: transactionIdParams }), controller.getTransactionDetail);

module.exports = { customerRouter, transactionRouter };
