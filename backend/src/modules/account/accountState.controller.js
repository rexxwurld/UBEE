const { setAccountState, getAccountState } = require("./accountState.service");

// PATCH /api/v1/admin/accounts/:userId/state
// Header: x-admin-key
// Body: { state: "active"|"frozen"|"dormant"|"closed", reason, performedBy? }
exports.updateState = async (req, res) => {
    try {
        const { userId } = req.params;
        const { state, reason, performedBy } = req.body;

        const result = await setAccountState(userId, { state, reason, performedBy });

        res.json({ status: true, unchanged: result.unchanged, data: result.user });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};

// GET /api/v1/admin/accounts/:userId/state
// Header: x-admin-key
exports.getState = async (req, res) => {
    try {
        const { userId } = req.params;
        const result = await getAccountState(userId);
        res.json({ status: true, data: result });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};
