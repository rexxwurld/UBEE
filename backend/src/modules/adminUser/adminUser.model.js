// src/modules/adminUser/adminUser.model.js
//
// Replaces "one shared x-admin-key for every admin action" (audit
// §9/§10: "no RBAC... single shared secret for ALL admin capability, no
// per-operator identity") with real, individually attributable operator
// accounts and roles. The legacy shared key still works as a fallback
// (see middleware/requireAdminAuth.js) so nothing breaks mid-migration,
// but it's now the deprecated path, not the only path.
//
// Roles (deliberately small and coarse for now - a real maker-checker/
// approval system, not just role-gating, is the next step - see
// src/modules/approval/):
//   superadmin - everything, including creating other admin accounts,
//                partner onboarding/secret rotation.
//   ops        - day-to-day money operations: pool accounts, deposits,
//                adjustments, payouts/refunds visibility.
//   compliance - KYC verification, account freeze/unfreeze/dormant/close.
//   support    - read-only: pool status, held-deposit lists, refund lookup.

const mongoose = require("mongoose");

const adminUserSchema = new mongoose.Schema(
    {
        username: { type: String, required: true, unique: true, lowercase: true, trim: true },
        passwordHash: { type: String, required: true },
        role: {
            type: String,
            enum: ["superadmin", "ops", "compliance", "support"],
            required: true
        },
        status: {
            type: String,
            enum: ["active", "disabled"],
            default: "active"
        },
        lastLoginAt: { type: Date, default: null },
        createdBy: { type: String, default: null } // username of whoever created this account, or "bootstrap"
    },
    { timestamps: true }
);

module.exports = mongoose.model("AdminUser", adminUserSchema);
