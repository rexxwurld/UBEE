const disputeService = require("./dispute.service");

// --- Customer-facing ---

// POST /api/v1/disputes  (auth)
exports.raise = async (req, res) => {
    try {
        const { relatedType, relatedEntityRef, subject, description } = req.body;
        const dispute = await disputeService.raiseDispute(req.user.id, { relatedType, relatedEntityRef, subject, description });
        res.status(201).json({ status: true, data: dispute });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};

// GET /api/v1/disputes  (auth)
exports.listMine = async (req, res) => {
    try {
        const disputes = await disputeService.listMyDisputes(req.user.id);
        res.json({ status: true, count: disputes.length, data: disputes });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};

// GET /api/v1/disputes/:reference  (auth, own disputes only)
exports.getMine = async (req, res) => {
    try {
        const dispute = await disputeService.getMyDispute(req.user.id, req.params.reference);
        res.json({ status: true, data: dispute });
    } catch (err) {
        res.status(404).json({ status: false, message: err.message });
    }
};

// --- Admin-facing ---

// GET /api/v1/admin/disputes?status=open
exports.listAll = async (req, res) => {
    try {
        const disputes = await disputeService.listDisputes({ status: req.query.status });
        res.json({ status: true, count: disputes.length, data: disputes });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};

// GET /api/v1/admin/disputes/:id
exports.getOne = async (req, res) => {
    try {
        const dispute = await disputeService.getDispute(req.params.id);
        res.json({ status: true, data: dispute });
    } catch (err) {
        res.status(404).json({ status: false, message: err.message });
    }
};

// PATCH /api/v1/admin/disputes/:id
// Body: { status?, assignedTo?, resolutionNotes? }
exports.update = async (req, res) => {
    try {
        const { status, assignedTo, resolutionNotes } = req.body;
        const dispute = await disputeService.updateDispute(req.params.id, {
            status, assignedTo, resolutionNotes, performedBy: req.admin.username
        });
        res.json({ status: true, data: dispute });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};
