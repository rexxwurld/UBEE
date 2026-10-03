const { processPayout } = require("./payout.service");

// POST /api/v1/payouts
// Called by SwiftPay. Verified by verifySwiftpaySignature middleware
// before this ever runs.
exports.createPayout = async (req, res) => {
    try {
        const {
            idempotencyKey,
            linkedService,
            destinationAccountNumber,
            destinationBank,
            destinationAccountName,
            amount
        } = req.body;

        const result = await processPayout({
            idempotencyKey,
            linkedService,
            destinationAccountNumber,
            destinationBank,
            destinationAccountName,
            amount
        });

        const statusCode = result.duplicate ? 200 : (result.payout.status === "success" ? 201 : 402);

        res.status(statusCode).json({
            status: result.payout.status === "success" || result.duplicate,
            duplicate: result.duplicate,
            data: result.payout
        });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};
