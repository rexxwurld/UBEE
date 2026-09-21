const approvalService = require("./approval.service");

// POST /api/v1/admin/approvals  (role: ops)
// Body: { type: "adjustment", payload: {...applyAdjustment args}, requestReason }
exports.create = async (req, res) => {
    try {
        const { type, payload, requestReason } = req.body;
        const request = await approvalService.createRequest({
            type, payload, requestedBy: req.admin.username, requestReason
        });
        res.status(201).json({ status: true, data: request });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};

// GET /api/v1/admin/approvals  (role: ops/compliance/superadmin)
exports.list = async (req, res) => {
    try {
        const requests = await approvalService.listPending();
        res.json({ status: true, count: requests.length, data: requests });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};

// POST /api/v1/admin/approvals/:id/approve  (role: compliance/superadmin - NOT ops)
exports.approve = async (req, res) => {
    try {
        const request = await approvalService.approveRequest(req.params.id, { performedBy: req.admin.username });
        res.json({ status: true, data: request });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};

// POST /api/v1/admin/approvals/:id/reject  (role: compliance/superadmin - NOT ops)
exports.reject = async (req, res) => {
    try {
        const request = await approvalService.rejectRequest(req.params.id, {
            performedBy: req.admin.username, reason: req.body.reason
        });
        res.json({ status: true, data: request });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};
