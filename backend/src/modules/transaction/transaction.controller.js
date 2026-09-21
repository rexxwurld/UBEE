const service = require("./transaction.service");
const { getUserTransactions } = require("./transaction.service");

// GET HISTORY
// ?limit=20&before=<transactionId>
//
// FOUND WHILE WORKING ON PHASE 10 (flagged in the original audit's
// §17): this endpoint's response used {success, transactions} while
// virtually every other controller built since Phase 1 uses
// {status, data} - one of the two genuine response-shape
// inconsistencies still left over from the original codebase (the
// other was wallet.controller.js's getWallet, also fixed this phase).
// Brought into line with the rest of the API for a mobile client that
// has to parse a consistent shape across every endpoint.
const getHistory = async (req, res) => {
    try {
        const userId = req.user.id;
        const { limit, before } = req.query;

        const result = await getUserTransactions(userId, { limit, before });

        res.json({
            status: true,
            data: result.transactions,
            nextCursor: result.nextCursor
        });

    } catch (err) {
        res.status(500).json({ status: false, message: err.message });
    }
};

// TRANSFER MONEY
const transfer = async (req, res) => {
    try {
        const { accountNumber, amount, description, bank, idempotencyKey } = req.body;

        // Accept the idempotency key from a header too, matching how most
        // real payment APIs do it (e.g. "Idempotency-Key").
        const key = idempotencyKey || req.headers["idempotency-key"] || null;

        const result = await service.transfer(
            req.user.id,
            accountNumber,
            amount,
            description,
            bank,
            key
        );

        res.status(result.duplicate ? 200 : 201).json({
            status: true,
            message: result.duplicate ? "Transfer already processed (idempotent replay)" : "Transfer successful",
            duplicate: result.duplicate,
            data: result.transactions
        });

    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};

module.exports = {
    getHistory,
    transfer
};
