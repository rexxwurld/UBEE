const reconciliationService = require("./reconciliation.service");
const { runOnce } = require("../../jobs/reconciliation.job");

// GET /api/v1/admin/reconciliation/exceptions?status=open
exports.listExceptions = async (req, res) => {
    try {
        const status = req.query.status || "open";
        const exceptions = await reconciliationService.listExceptions({ status });
        res.json({ status: true, count: exceptions.length, data: exceptions });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};

// POST /api/v1/admin/reconciliation/exceptions/:id/resolve
// Body: { notes }
exports.resolveException = async (req, res) => {
    try {
        const { notes } = req.body;
        const exception = await reconciliationService.resolveException(req.params.id, {
            performedBy: req.admin.username, notes
        });
        res.json({ status: true, data: exception });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};

// POST /api/v1/admin/reconciliation/run
// Manually trigger a reconciliation pass on demand, independent of
// whether the scheduled job (RUN_RECONCILIATION_JOB) is enabled - e.g.
// right after investigating a specific reported discrepancy, without
// waiting for the next scheduled hourly run.
exports.runNow = async (req, res) => {
    try {
        const result = await runOnce();
        res.json({ status: true, data: result });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};
