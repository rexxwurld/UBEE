// src/middleware/requireAdminAuth.js
//
// Replaces the "one shared x-admin-key for every admin action, no
// per-operator identity, no RBAC" pattern the audit flagged (§9/§10).
//
// Primary path: Authorization: Bearer <adminToken> - a JWT issued by
// POST /api/v1/admin/auth/login (adminUser.service.js), signed with
// ADMIN_JWT_SECRET (separate from the customer JWT_SECRET). The
// AdminUser's current status is checked against the DB on every
// request (not just trusted from the JWT claims) specifically so a
// disabled admin account is locked out immediately, not just after
// their token happens to expire.
//
// Legacy fallback path: the old x-admin-key shared secret, treated as
// superadmin-equivalent for backward compatibility so nothing breaks
// mid-migration. EVERY use of this fallback is audit-logged at
// "critical" severity and logged to the console - the shared key was
// the exact thing this RBAC system exists to get away from, so its
// continued use should be visible and create pressure to finish
// migrating, not fade into the background. Set
// DISABLE_LEGACY_ADMIN_KEY=true once real AdminUser accounts are
// onboarded to remove this path entirely (bootstrap - creating the
// FIRST AdminUser - still works even with this set, since that's a
// separate, one-time-only code path in adminUser.service.js, not this
// middleware).
//
// Usage: requireAdminAuth() - any active admin, any role.
//        requireAdminAuth(["superadmin"]) - only that role (or roles).

const jwt = require("jsonwebtoken");
const env = require("../config/env");
const AdminUser = require("../modules/adminUser/adminUser.model");
const auditLog = require("../modules/audit/auditLog.service");

module.exports = function requireAdminAuth(allowedRoles = null) {
    return async function (req, res, next) {
        try {
            const authHeader = req.headers["authorization"];
            const bearerToken = authHeader && authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

            if (bearerToken) {
                let decoded;
                try {
                    decoded = jwt.verify(bearerToken, env.ADMIN_JWT_SECRET);
                } catch (err) {
                    return res.status(401).json({ status: false, message: "invalid_or_expired_admin_token" });
                }

                const admin = await AdminUser.findById(decoded.id);
                if (!admin || admin.status !== "active") {
                    return res.status(401).json({ status: false, message: "admin_account_not_active" });
                }

                // superadmin implicitly passes any role check - it's
                // the "can do everything" role by definition, so
                // callers shouldn't have to remember to list it in
                // every allowedRoles array.
                if (allowedRoles && admin.role !== "superadmin" && !allowedRoles.includes(admin.role)) {
                    return res.status(403).json({ status: false, message: "insufficient_role" });
                }

                req.admin = { id: admin._id.toString(), username: admin.username, role: admin.role };
                return next();
            }

            // Legacy fallback - see the file-level comment above.
            const legacyKey = req.headers["x-admin-key"];
            if (!env.DISABLE_LEGACY_ADMIN_KEY && env.ADMIN_KEY && legacyKey === env.ADMIN_KEY) {
                console.warn(`[SECURITY] legacy x-admin-key used for ${req.method} ${req.originalUrl} - migrate to a real AdminUser account (see POST /api/v1/admin/auth/login).`);
                await auditLog.record({
                    actorType: "admin",
                    actorRef: "legacy_shared_admin_key",
                    action: "admin.legacy_key_used",
                    severity: "critical",
                    metadata: { method: req.method, path: req.originalUrl }
                });
                req.admin = { id: null, username: "legacy_shared_admin_key", role: "superadmin" };
                return next();
            }

            return res.status(401).json({ status: false, message: "admin_authentication_required" });
        } catch (err) {
            res.status(500).json({ status: false, message: "admin_auth_error" });
        }
    };
};
