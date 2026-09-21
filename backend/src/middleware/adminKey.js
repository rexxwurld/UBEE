// src/middleware/adminKey.js
//
// SUPERSEDED by middleware/requireAdminAuth.js (Phase 4 - RBAC). No
// route in this codebase imports this file anymore - every former
// requireAdminKey route now uses requireAdminAuth, which still accepts
// this exact x-admin-key as a deprecated fallback (see that file's
// comment), so the legacy key still works for existing integrations,
// just through the new middleware instead of this one.
//
// Kept only in case something outside this repo still imports this
// specific file path directly. New code should use requireAdminAuth.

module.exports = function requireAdminKey(req, res, next) {
    const key = req.headers["x-admin-key"];

    if (!process.env.ADMIN_KEY) {
        // Fail closed: if no admin key is configured, nobody gets in.
        return res.status(500).json({ message: "admin_key_not_configured" });
    }

    if (!key || key !== process.env.ADMIN_KEY) {
        return res.status(401).json({ message: "unauthorized" });
    }

    next();
};
