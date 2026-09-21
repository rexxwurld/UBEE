const kycService = require("./kyc.service");

// POST /api/v1/kyc/submit  (auth)
exports.submit = async (req, res) => {
    try {
        const { bvn, nin, dateOfBirth } = req.body;
        const result = await kycService.submitKyc(req.user.id, { bvn, nin, dateOfBirth });
        res.json({ status: true, data: result });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};

// GET /api/v1/kyc/status  (auth)
exports.getStatus = async (req, res) => {
    try {
        const result = await kycService.getKycStatus(req.user.id);
        res.json({ status: true, data: result });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};

// POST /api/v1/admin/kyc/:userId/verify  (x-admin-key)
// Body: { approve: boolean, tier?: "tier1"|"tier2"|"tier3", performedBy?, rejectionReason? }
exports.verify = async (req, res) => {
    try {
        const { userId } = req.params;
        const { approve, tier, performedBy, rejectionReason } = req.body;
        const result = await kycService.verifyKyc(userId, { approve, tier, performedBy, rejectionReason });
        res.json({ status: true, data: result });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};
