// src/modules/approval/approval.service.js
const ApprovalRequest = require("./approvalRequest.model");
const auditLog = require("../audit/auditLog.service");

// Dispatch table: what actually runs when a request of this type gets
// approved. Kept as a lazy require inside the function (not a top-level
// import) to avoid a circular require - adjustment.service.js doesn't
// need to know approval.service.js exists, only the reverse.
async function executeApproved(type, payload) {
    if (type === "adjustment") {
        const { applyAdjustment } = require("../adjustment/adjustment.service");
        const result = await applyAdjustment(payload);
        return result.adjustment._id.toString();
    }
    throw new Error(`no_executor_registered_for_approval_type: ${type}`);
}

async function createRequest({ type, payload, requestedBy, requestReason }) {
    if (!["adjustment"].includes(type)) throw new Error("invalid_approval_type");
    if (!requestReason || !requestReason.trim()) throw new Error("requestReason_required");

    const request = await ApprovalRequest.create({ type, payload, requestedBy, requestReason });

    await auditLog.record({
        actorType: "admin",
        actorRef: requestedBy,
        action: "approval.requested",
        entityType: "ApprovalRequest",
        entityRef: request._id.toString(),
        severity: "warning",
        metadata: { type, requestReason }
    });

    return request;
}

async function listPending() {
    return ApprovalRequest.find({ status: "pending" }).sort({ createdAt: 1 });
}

async function approveRequest(id, { performedBy }) {
    const request = await ApprovalRequest.findById(id);
    if (!request) throw new Error("approval_request_not_found");
    if (request.status !== "pending") throw new Error("approval_request_already_decided");

    // The actual dual-authorization control: whoever requested this
    // cannot also be the one who approves it. Without this check, "maker-
    // checker" is just a UI convention a single compromised or malicious
    // admin account can trivially satisfy by clicking both buttons.
    if (request.requestedBy === performedBy) {
        throw new Error("requester_cannot_approve_their_own_request");
    }

    let resultRef;
    try {
        resultRef = await executeApproved(request.type, request.payload);
    } catch (err) {
        // The underlying action itself failed (e.g. insufficient
        // balance for a debit adjustment) - record that as a rejection
        // with the real reason, rather than leaving the request stuck
        // "pending" forever with no explanation.
        request.status = "rejected";
        request.decidedBy = performedBy;
        request.decidedAt = new Date();
        request.rejectionReason = `execution_failed: ${err.message}`;
        await request.save();

        await auditLog.record({
            actorType: "admin",
            actorRef: performedBy,
            action: "approval.execution_failed",
            entityType: "ApprovalRequest",
            entityRef: request._id.toString(),
            severity: "critical",
            metadata: { error: err.message }
        });

        throw err;
    }

    request.status = "approved";
    request.decidedBy = performedBy;
    request.decidedAt = new Date();
    request.resultRef = resultRef;
    await request.save();

    await auditLog.record({
        actorType: "admin",
        actorRef: performedBy,
        action: "approval.approved",
        entityType: "ApprovalRequest",
        entityRef: request._id.toString(),
        severity: "critical",
        metadata: { type: request.type, requestedBy: request.requestedBy, resultRef }
    });

    return request;
}

async function rejectRequest(id, { performedBy, reason }) {
    const request = await ApprovalRequest.findById(id);
    if (!request) throw new Error("approval_request_not_found");
    if (request.status !== "pending") throw new Error("approval_request_already_decided");
    if (request.requestedBy === performedBy) {
        throw new Error("requester_cannot_decide_their_own_request");
    }
    if (!reason || !reason.trim()) throw new Error("rejection_reason_required");

    request.status = "rejected";
    request.decidedBy = performedBy;
    request.decidedAt = new Date();
    request.rejectionReason = reason;
    await request.save();

    await auditLog.record({
        actorType: "admin",
        actorRef: performedBy,
        action: "approval.rejected",
        entityType: "ApprovalRequest",
        entityRef: request._id.toString(),
        severity: "warning",
        metadata: { reason }
    });

    return request;
}

module.exports = { createRequest, listPending, approveRequest, rejectRequest };
