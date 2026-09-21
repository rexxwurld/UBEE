// src/modules/audit/auditLog.model.js
const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
    {
        actorType: { type: String, enum: ["user", "system", "admin"], required: true },
        actorRef: { type: String },

        action: { type: String, required: true }, // e.g. "user.login", "transfer.blocked_limit"
        entityType: { type: String },
        entityRef: { type: String },

        ip: { type: String },
        metadata: { type: mongoose.Schema.Types.Mixed },

        severity: { type: String, enum: ["info", "warning", "critical"], default: "info" },

        // Correlation ID for the HTTP request that caused this entry -
        // see src/utils/requestContext.js. Lets an operator answer
        // "show me everything that happened during this one request"
        // (cross-referenced against morgan's access log, which now
        // prints the same ID - see app.js), not just "show me
        // everything this user/action did" in isolation.
        requestId: { type: String, default: null, index: true }
    },
    { timestamps: true }
);

auditLogSchema.index({ action: 1, createdAt: -1 });

// FOUND WHILE WORKING ON PHASE 6 (flagged in the original audit's §14
// but not fixed until now): actorRef had no index at all, meaning "show
// me everything this user/admin did" - a completely ordinary
// investigation query, and exactly the kind of question Phase 6 exists
// to make answerable - triggered a full collection scan of every audit
// log entry ever written, with no way to bound it. Compound with
// createdAt so it also serves the far more common real query, "this
// actor's activity in a time range," not just "all of it, unsorted."
auditLogSchema.index({ actorRef: 1, createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
