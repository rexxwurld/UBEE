const { processRefund, getRefundByReference } = require("./refund.service");

// POST /api/v1/refunds
// Called by SwiftPay after verifySwiftpaySignature middleware.
exports.createRefund = async (req, res) => {
    try {
        const result = await processRefund(req.body);

        return res.status(200).json({
            status: true,
            duplicate: result.duplicate,
            data: {
                submissionRef: result.refund.reference,
                rejectionReason: null
            }
        });
    } catch (err) {
        console.error("Create refund error:", err);

        return res.status(400).json({
            status: false,
            duplicate: false,
            data: {
                submissionRef: null,
                rejectionReason: err.message || "refund_rejected"
            }
        });
    }
};

exports.getRefund = async (req, res) => {
    try {
        const refund = await getRefundByReference(req.params.reference);

        if (!refund) {
            return res.status(404).json({
                status: false,
                data: { rejectionReason: "refund_not_found" }
            });
        }

        return res.status(200).json({ status: true, data: refund });
    } catch (err) {
        console.error("Get refund error:", err);
        return res.status(500).json({
            status: false,
            data: { rejectionReason: "unable_to_retrieve_refund" }
        });
    }
};
