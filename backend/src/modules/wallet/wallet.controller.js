const walletService = require("./wallet.service");
const User = require("../auth/user.model");

// GET WALLET
exports.getWallet = async (req, res) => {
    try {
        const wallet = await walletService.getWallet(req.user.id);

        res.json({
            status: true,
            data: wallet
        });
    } catch (err) {
        res.status(400).json({
            status: false,
            message: err.message
        });
    }
};

// GET /api/v1/wallet/lookup/:accountNumber
// Returns the account holder's name for a valid UBee account number.
exports.lookup = async (req, res) => {
    try {
        const { accountNumber } = req.params;

        if (!/^\d{10}$/.test(accountNumber)) {
            return res.status(400).json({
                status: false,
                message: "account_number_must_be_10_digits"
            });
        }

        const owner = await User.findOne({
            phone: `0${accountNumber}`
        }).select("fullname accountState");

        if (!owner || owner.accountState !== "active") {
            return res.status(404).json({
                status: false,
                message: "account_not_found"
            });
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
        res.status(400).json({
            status: false,
            message: err.message
        });
    }
};
