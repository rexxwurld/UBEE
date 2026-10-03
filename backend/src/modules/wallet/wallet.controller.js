const walletService = require("./wallet.service");
const Wallet = require("./wallet.model");
const User = require("../auth/user.model");

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

// GET /api/v1/wallet/lookup/:accountNumber  (auth)
// Returns only what the sender needs to confirm they typed the right
// account: the holder's name. Pool/virtual wallets (no owning user) and
// accounts that can't receive money are reported as "not found" rather
// than leaking why.
exports.lookup = async (req, res) => {
    try {
        const { accountNumber } = req.params;
        if (!/^\d{10}$/.test(accountNumber)) {
            return res.status(400).json({ status: false, message: "account_number_must_be_10_digits" });
        }

        const wallet = await Wallet.findOne({ accountNumber });
        const owner = wallet?.userId ? await User.findById(wallet.userId).select("fullname accountState") : null;

        if (!owner || owner.accountState !== "active") {
            return res.status(404).json({ status: false, message: "account_not_found" });
        }

        res.json({
            status: true,
            data: {
                accountNumber,
                fullname: owner.fullname,
                isSelf: String(owner._id) === String(req.user.id)
            }
        });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};
