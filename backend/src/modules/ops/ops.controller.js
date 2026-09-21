const opsService = require("./ops.service");

// GET /api/v1/admin/customers/search?query=
exports.searchCustomers = async (req, res) => {
    try {
        const results = await opsService.searchCustomers(req.query.query);
        res.json({ status: true, count: results.length, data: results });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};

// GET /api/v1/admin/customers/:userId
exports.getCustomerProfile = async (req, res) => {
    try {
        const profile = await opsService.getCustomerProfile(req.params.userId);
        res.json({ status: true, data: profile });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};

// GET /api/v1/admin/transactions/search
exports.searchTransactions = async (req, res) => {
    try {
        const { accountNumber, status, from, to, before, limit } = req.query;
        const result = await opsService.searchTransactions({ accountNumber, status, from, to, before, limit });
        res.json({ status: true, count: result.transactions.length, data: result.transactions, nextCursor: result.nextCursor });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};

// GET /api/v1/admin/transactions/:id
exports.getTransactionDetail = async (req, res) => {
    try {
        const result = await opsService.getTransactionDetail(req.params.id);
        res.json({ status: true, data: result });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};
