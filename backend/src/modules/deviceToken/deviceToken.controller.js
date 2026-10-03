const service = require("./notification.service");

// POST /api/v1/notifications/devices  (auth)
// Body: { token, platform: "ios"|"android"|"web" }
exports.registerDevice = async (req, res) => {
    try {
        const { token, platform } = req.body;
        await service.registerDevice(req.user.id, { token, platform });
        res.status(201).json({ status: true, message: "device_registered" });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};

// DELETE /api/v1/notifications/devices/:token  (auth)
exports.unregisterDevice = async (req, res) => {
    try {
        await service.unregisterDevice(req.user.id, req.params.token);
        res.json({ status: true, message: "device_unregistered" });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};
