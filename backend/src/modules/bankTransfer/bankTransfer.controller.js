const service = require("./bankTransfer.service");
const { verifyPinForUser } = require("../auth/pin.service");

const view = (bt) => ({
    id: bt._id,
    status: bt.status,
    amount: bt.amount,
    fee: bt.fee,
    recipientName: bt.destinationAccountName,
    bankName: bt.destinationBankName,
    accountNumber: bt.destinationAccountNumber,
    createdAt: bt.createdAt
});

// GET /api/v1/bank-transfers/config
exports.config = async (req, res) => {
    try { res.json({ status: true, data: await service.getConfig(req.user.id) }); }
    catch (err) { res.status(400).json({ status: false, message: err.message }); }
};

// GET /api/v1/bank-transfers/banks
exports.banks = async (req, res) => {
    try { res.json({ status: true, data: await service.listBanks() }); }
    catch (err) { res.status(400).json({ status: false, message: err.message }); }
};

// GET /api/v1/bank-transfers/name-enquiry?accountNumber=&bankCode=
exports.nameEnquiry = async (req, res) => {
    try {
        const { accountNumber, bankCode } = req.query;
        const r = await service.nameEnquiry({ accountNumber, bankCode });
        res.json({ status: true, data: { accountName: r.accountName, accountNumber, bankCode } });
    } catch (err) {
        res.status(404).json({ status: false, message: "account_not_found" });
    }
};

// POST /api/v1/bank-transfers
exports.create = async (req, res) => {
    try {
        await verifyPinForUser(req.user.id, req.body.pin);

        const key = req.body.idempotencyKey || req.headers["idempotency-key"];
        const { pin, ...transferInput } = req.body; // the PIN goes no further than the check above
        const { duplicate, transfer } = await service.initiate(req.user.id, { ...transferInput, idempotencyKey: key });

        if (transfer.status === "failed") {
            return res.status(400).json({
                status: false,
                message: "The bank could not complete this transfer. Your money has been returned.",
                data: view(transfer)
            });
        }

        const message = transfer.status === "success"
            ? "Transfer successful"
            : "Transfer is being processed. We will update you once the bank confirms.";

        res.status(duplicate ? 200 : 201).json({ status: true, message, duplicate, data: view(transfer) });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};
