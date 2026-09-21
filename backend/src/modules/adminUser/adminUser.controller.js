const adminUserService = require("./adminUser.service");

// POST /api/v1/admin/auth/bootstrap
// Body: { username, password }
// Header: x-admin-key
// Only works while zero AdminUser accounts exist. See
// adminUser.service.js:bootstrapFirstSuperadmin.
exports.bootstrap = async (req, res) => {
    try {
        const { username, password } = req.body;
        const adminKeyProvided = req.headers["x-admin-key"];
        const result = await adminUserService.bootstrapFirstSuperadmin({ username, password, adminKeyProvided });
        res.status(201).json({ status: true, data: result });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};

// POST /api/v1/admin/auth/login
// Body: { username, password }
exports.login = async (req, res) => {
    try {
        const { username, password } = req.body;
        const result = await adminUserService.login({ username, password });
        res.json({ status: true, data: result });
    } catch (err) {
        res.status(401).json({ status: false, message: err.message });
    }
};

// POST /api/v1/admin/auth/users  (requireAdminAuth(["superadmin"]))
// Body: { username, password, role }
exports.createAdmin = async (req, res) => {
    try {
        const { username, password, role } = req.body;
        const result = await adminUserService.createAdminUser({
            username, password, role, createdBy: req.admin.username
        });
        res.status(201).json({ status: true, data: result });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};

// GET /api/v1/admin/auth/users  (requireAdminAuth(["superadmin"]))
exports.listAdmins = async (req, res) => {
    try {
        const admins = await adminUserService.listAdmins();
        res.json({ status: true, count: admins.length, data: admins });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};

// PATCH /api/v1/admin/auth/users/:username/status  (requireAdminAuth(["superadmin"]))
// Body: { status: "active"|"disabled" }
exports.setAdminStatus = async (req, res) => {
    try {
        const { username } = req.params;
        const { status } = req.body;
        const result = await adminUserService.setStatus(username, status, { performedBy: req.admin.username });
        res.json({ status: true, data: result });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};
