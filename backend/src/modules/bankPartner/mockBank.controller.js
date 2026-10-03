// src/modules/bankPartner/mockBank.controller.js
//
// DEVELOPMENT ONLY.
//
// Stands in for NIBSS/your real banking rail. In production, a real
// bank-received-money webhook would call processDeposit() directly
// (see deposit.service.js / deposit.controller.js's TODO comment).
// This controller exists so you can trigger that same code path
// locally, without a live bank connection.
//
// Flow this simulates:
//
//   "customer" sends money to a RexxPay virtual account
//        |
//        v
//   POST /api/v1/mock-bank/simulate-transfer   <-- you are here
//        |
//        v
//   processDeposit()
//        - credits the Wallet
//        - posts the double-entry ledger rows
//        - credits the settlement pool
//        - if the wallet is SwiftPay-linked: signs + POSTs a webhook to
//          SwiftPay's /api/v1/webhooks/bank, which is what actually
//          flips the SwiftPay transaction to "successful"
//
// Nothing here talks to SwiftPay directly - that's entirely
// processDeposit()'s job, so this stays a true simulation of "the bank"
// and not a shortcut that bypasses the real integration path.

const { processDeposit } = require("../deposit/deposit.service");

exports.simulateTransfer = async (req, res) => {
    try {
        const { accountNumber, amount, currency = "NGN" } = req.body;

        if (!accountNumber || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
            return res.status(400).json({
                status: false,
                message: "accountNumber and a positive numeric amount are required"
            });
        }

        // A real bank reference is unique per transfer - fake one the same
        // way so idempotency (unique index on Deposit.reference) still works.
        const reference = `mockbank_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

        const result = await processDeposit({
            accountNumber,
            amount,
            reference,
            rawPayload: { simulated: true, currency, source: "mock-bank" }
        });

        return res.status(result.duplicate ? 200 : (result.held ? 202 : 201)).json({
            status: true,
            duplicate: result.duplicate,
            held: !!result.held,
            message: result.duplicate
                ? "duplicate reference - original deposit returned"
                : result.held
                    ? "amount did not match expected amount - held for manual review (see GET /api/v1/admin/deposits/held)"
                    : "simulated transfer processed",
            data: result.deposit
        });

    } catch (err) {
        // Surface the real reason (destination_wallet_not_found,
        // wallet_not_linked_to_a_settlement_pool, invalid_deposit_amount,
        // etc.) instead of a generic 500 - this is a test tool, the
        // specific failure is the useful part.
        return res.status(400).json({ status: false, message: err.message });
    }
};
