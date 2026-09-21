// src/modules/bank/bank.controller.js
//
// Thin wrappers over whatever provider is active (src/providers/) -
// this module has no business logic of its own, it just exposes two
// real capabilities the mock provider never had an equivalent for:
// listing which banks can actually be paid out to, and confirming
// whose account a number belongs to BEFORE money is sent to it.

const { getActiveProvider, getActiveProviderName } = require("../../providers");

// GET /api/v1/banks
exports.listBanks = async (req, res) => {
    try {
        const banks = await getActiveProvider().listBanks();
        res.json({ status: true, provider: getActiveProviderName(), count: banks.length, data: banks });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};

// GET /api/v1/banks/name-enquiry?accountNumber=&bankCode=
// A real misdirected-payout control the old stub had no equivalent
// for at all: confirm the account name BEFORE a partner submits a
// payout/refund instruction against it, so an obviously wrong
// destination (typo'd account number, wrong bank code) gets caught
// before money moves, not after.
exports.nameEnquiry = async (req, res) => {
    try {
        const { accountNumber, bankCode } = req.query;
        const result = await getActiveProvider().nameEnquiry({ accountNumber, bankCode });
        res.json({ status: true, data: result });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};
