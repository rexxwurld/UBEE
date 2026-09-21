const { processDeposit, listHeldDeposits, resolveHeldDeposit } = require("./deposit.service");

// POST /api/v1/admin/deposits
// Body: { accountNumber, amount, reference }
// Header: x-admin-key
//
// TODO: once you're integrated with a real banking rail / provider,
// replace this admin-triggered route with a public webhook route that
// the provider calls, protected by *their* signature scheme instead of
// x-admin-key. The service function (processDeposit) doesn't need to
// change - only how it gets called.
exports.simulateDeposit = async (req, res) => {
    try {
        const { accountNumber, amount, reference, rawPayload } = req.body;

        if (!accountNumber || !amount || !reference) {
            return res.status(400).json({
                status: false,
                message: "accountNumber, amount and reference are required"
            });
        }

        const result = await processDeposit({ accountNumber, amount, reference, rawPayload });

        // held: amount didn't match what was expected for this account -
        // persisted for manual review rather than credited or rejected
        // outright (see deposit.service.js's "held" branch). 202 signals
        // "accepted but not yet resolved", distinct from 201 (credited)
        // and the 200 duplicate-replay case.
        const statusCode = result.duplicate ? 200 : (result.held ? 202 : 201);

        res.status(statusCode).json({
            status: true,
            duplicate: result.duplicate,
            held: !!result.held,
            data: result.deposit
        });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};

// GET /api/v1/admin/deposits/held
// Header: x-admin-key
exports.getHeldDeposits = async (req, res) => {
    try {
        const deposits = await listHeldDeposits();
        res.json({ status: true, count: deposits.length, data: deposits });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};

// POST /api/v1/admin/deposits/:id/resolve
// Header: x-admin-key
// Body: { action: "credit"|"reject", performedBy? }
exports.resolveDeposit = async (req, res) => {
    try {
        const { action, performedBy } = req.body;
        const { id } = req.params;

        const result = await resolveHeldDeposit(id, { action, performedBy });

        res.json({ status: true, data: result.deposit });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};
