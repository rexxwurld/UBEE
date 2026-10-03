const router = require("express").Router();
const controller = require("./adminUser.controller");
const requireAdminAuth = require("../../middleware/requireAdminAuth");
const { authLimiter } = require("../../middleware/rateLimiters");
const validate = require("../../middleware/validate");
const { bootstrapBody, loginBody, createAdminBody, usernameParams, setStatusBody } = require("./adminUser.validation");

// Both of these are unauthenticated-by-JWT (that's the point - you
// don't have a token yet), so they get the same tight brute-force
// rate limit as customer login/register.
router.post("/bootstrap", authLimiter, validate({ body: bootstrapBody }), controller.bootstrap);
router.post("/login", authLimiter, validate({ body: loginBody }), controller.login);

// Managing OTHER admin accounts is superadmin-only.
router.post("/users", requireAdminAuth(["superadmin"]), validate({ body: createAdminBody }), controller.createAdmin);
router.get("/users", requireAdminAuth(["superadmin"]), controller.listAdmins);
router.patch(
    "/users/:username/status",
    requireAdminAuth(["superadmin"]),
    validate({ params: usernameParams, body: setStatusBody }),
    controller.setAdminStatus
);

module.exports = router;
