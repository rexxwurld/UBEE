// src/modules/audit/auditLog.service.js
const AuditLog = require("./auditLog.model");
const requestContext = require("../../utils/requestContext");

// Fire-and-forget: an audit-log write failure must never block the real
// operation. Log to stderr so it can still be caught by ops monitoring.
async function record({ actorType, actorRef, action, entityType, entityRef, ip, metadata, severity, requestId }) {
    try {
        // requestId is auto-filled from the current request's async
        // context (see src/utils/requestContext.js) unless the caller
        // explicitly passed one - which none of this codebase's
        // existing ~40+ call sites do, so this makes every one of them
        // correlation-ID-aware with no changes needed at the call site.
        const resolvedRequestId = requestId ?? requestContext.getRequestId();
        await AuditLog.create({ actorType, actorRef, action, entityType, entityRef, ip, metadata, severity, requestId: resolvedRequestId });
    } catch (err) {
        console.error("[audit] failed to write audit log:", err.message, { action });
    }
}

module.exports = { record };
