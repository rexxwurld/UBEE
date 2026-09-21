const walletService = require("./wallet.service");

// GET WALLET
//
// FOUND WHILE WORKING ON PHASE 10: this returned the bare Mongoose
// document instead of the {status, data} envelope used everywhere
// else since Phase 1 - the second of the two real response-shape
// inconsistencies the audit flagged (the other was
// transaction.controller.js's getHistory, also fixed this phase).
exports.getWallet = async (req, res) => {
    try {

        const wallet = await walletService.getWallet(req.user.id);

        res.json({ status: true, data: wallet });

    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};

// NOTE: the old POST /credit "test only" endpoint has been removed.
// It mutated Wallet.balance directly - no ledger entry, no session, no
// audit log - and it was guarded only by normal user auth (not an admin
// key), so any authenticated customer could mint arbitrary balance into
// their own wallet. See src/modules/adjustment/ for the replacement:
// an admin-key-protected, ledgered, idempotent, audit-logged adjustment
// flow that follows the same session+ledger pattern already used by
// deposit.service.js / payout.service.js / refund.service.js.
