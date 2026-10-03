// src/modules/adminUser/adminUser.service.js
const jwt = require("jsonwebtoken");
const AdminUser = require("./adminUser.model");
const { hashPassword, comparePassword } = require("../../utils/hash");
const auditLog = require("../audit/auditLog.service");
const env = require("../../config/env");

const ADMIN_TOKEN_TTL = "8h"; // deliberately much shorter than the customer JWT's 7d (utils/token.js)

function signAdminToken(adminUser) {
    return jwt.sign(
        { id: adminUser._id, username: adminUser.username, role: adminUser.role, kind: "admin" },
        env.ADMIN_JWT_SECRET,
        { expiresIn: ADMIN_TOKEN_TTL }
    );
}

// One-time bootstrap: creates the first superadmin account, but ONLY
// while zero AdminUser accounts exist yet, and only when the caller
// presents the legacy ADMIN_KEY. After this runs once, ADMIN_KEY's
// per-request authority is meant to be phased out (see
// requireAdminAuth.js's deprecation path and DISABLE_LEGACY_ADMIN_KEY) -
// its only remaining job is unlocking this one bootstrap action.
async function bootstrapFirstSuperadmin({ username, password, adminKeyProvided }) {
    if (!env.ADMIN_KEY || adminKeyProvided !== env.ADMIN_KEY) {
        throw new Error("invalid_admin_key");
    }
    const existingCount = await AdminUser.countDocuments();
    if (existingCount > 0) {
        throw new Error("bootstrap_already_completed_admin_accounts_exist");
    }
    if (!username || !password || password.length < 12) {
        throw new Error("username_and_a_password_of_at_least_12_characters_required");
    }

    const passwordHash = await hashPassword(password);
    const admin = await AdminUser.create({
        username, passwordHash, role: "superadmin", status: "active", createdBy: "bootstrap"
    });

    await auditLog.record({
        actorType: "system",
        actorRef: "bootstrap",
        action: "adminUser.bootstrap_superadmin_created",
        entityType: "AdminUser",
        entityRef: admin._id.toString(),
        severity: "critical",
        metadata: { username }
    });

    return { id: admin._id, username: admin.username, role: admin.role };
}

// Creates an additional admin account. Only reachable via a route
// gated to role "superadmin" (see adminUser.routes.js) - enforced at
// the route layer via requireAdminAuth(["superadmin"]), not here.
async function createAdminUser({ username, password, role, createdBy }) {
    if (!username || !password || password.length < 12) {
        throw new Error("username_and_a_password_of_at_least_12_characters_required");
    }
    if (!["superadmin", "ops", "compliance", "support"].includes(role)) {
        throw new Error("invalid_role");
    }

    const passwordHash = await hashPassword(password);
    let admin;
    try {
        admin = await AdminUser.create({ username, passwordHash, role, createdBy });
    } catch (err) {
        if (err.code === 11000) throw new Error("username_already_exists");
        throw err;
    }

    await auditLog.record({
        actorType: "admin",
        actorRef: createdBy || "unknown_admin",
        action: "adminUser.created",
        entityType: "AdminUser",
        entityRef: admin._id.toString(),
        severity: "critical",
        metadata: { username, role }
    });

    return { id: admin._id, username: admin.username, role: admin.role, status: admin.status };
}

async function login({ username, password }) {
    const admin = await AdminUser.findOne({ username: String(username || "").toLowerCase().trim() });

    // Deliberately identical error for "no such user" and "wrong
    // password" - don't let this endpoint be used to enumerate valid
    // admin usernames.
    const genericError = () => new Error("invalid_credentials");

    if (!admin) throw genericError();
    if (admin.status !== "active") throw new Error("admin_account_disabled");

    const valid = await comparePassword(password, admin.passwordHash);
    if (!valid) {
        await auditLog.record({
            actorType: "admin",
            actorRef: admin.username,
            action: "adminUser.login_failed",
            severity: "warning"
        });
        throw genericError();
    }

    admin.lastLoginAt = new Date();
    await admin.save();

    await auditLog.record({
        actorType: "admin",
        actorRef: admin.username,
        action: "adminUser.login_success"
    });

    return { token: signAdminToken(admin), role: admin.role, username: admin.username };
}

async function setStatus(username, status, { performedBy }) {
    if (!["active", "disabled"].includes(status)) throw new Error("invalid_status");
    const admin = await AdminUser.findOne({ username: String(username).toLowerCase().trim() });
    if (!admin) throw new Error("admin_not_found");

    admin.status = status;
    await admin.save();

    await auditLog.record({
        actorType: "admin",
        actorRef: performedBy || "unknown_admin",
        action: `adminUser.${status}`,
        entityType: "AdminUser",
        entityRef: admin._id.toString(),
        severity: "critical",
        metadata: { username }
    });

    return { username: admin.username, status: admin.status };
}

async function listAdmins() {
    return AdminUser.find().select("-passwordHash").sort({ createdAt: 1 });
}

module.exports = { bootstrapFirstSuperadmin, createAdminUser, login, setStatus, listAdmins, signAdminToken };
