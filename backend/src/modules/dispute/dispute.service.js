// src/modules/dispute/dispute.service.js
const crypto = require("crypto");
const Dispute = require("./dispute.model");
const auditLog = require("../audit/auditLog.service");

function generateReference() {
    return `DSP-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

// Customer-initiated. No amount/money field on purpose - a dispute is a
// claim to be investigated, not a transaction; if it turns out money
// needs to move, that goes through the existing Adjustment/maker-checker
// flow (src/modules/adjustment/, src/modules/approval/) as a separate,
// deliberate, audit-logged action once an operator has actually decided
// the claim is valid - not automatically from a dispute being filed.
async function raiseDispute(userId, { relatedType, relatedEntityRef, subject, description }) {
    if (!subject || !subject.trim()) throw new Error("subject_required");
    if (!description || !description.trim()) throw new Error("description_required");

    const dispute = await Dispute.create({
        reference: generateReference(),
        raisedBy: userId,
        relatedType: relatedType || "other",
        relatedEntityRef: relatedEntityRef || null,
        subject,
        description
    });

    await auditLog.record({
        actorType: "user",
        actorRef: userId.toString(),
        action: "dispute.raised",
        entityType: "Dispute",
        entityRef: dispute._id.toString(),
        severity: "warning",
        metadata: { reference: dispute.reference, relatedType, relatedEntityRef }
    });

    return dispute;
}

async function listMyDisputes(userId) {
    return Dispute.find({ raisedBy: userId }).sort({ createdAt: -1 });
}

async function getMyDispute(userId, reference) {
    const dispute = await Dispute.findOne({ reference, raisedBy: userId });
    if (!dispute) throw new Error("dispute_not_found");
    return dispute;
}

// --- Admin side ---

async function listDisputes({ status } = {}) {
    const query = status ? { status } : {};
    return Dispute.find(query).sort({ createdAt: 1 }).populate("raisedBy", "fullname email phone");
}

async function getDispute(id) {
    const dispute = await Dispute.findById(id).populate("raisedBy", "fullname email phone");
    if (!dispute) throw new Error("dispute_not_found");
    return dispute;
}

// Single admin update endpoint covering assignment, status transitions,
// and resolution - kept as one function since these commonly happen
// together (e.g. "investigating" + assignedTo in the same call), rather
// than forcing an operator through several separate round-trips.
async function updateDispute(id, { status, assignedTo, resolutionNotes, performedBy }) {
    const dispute = await Dispute.findById(id);
    if (!dispute) throw new Error("dispute_not_found");
    if (["resolved", "rejected"].includes(dispute.status)) {
        throw new Error("dispute_already_closed");
    }

    if (assignedTo !== undefined) dispute.assignedTo = assignedTo;

    if (status) {
        if (!["open", "investigating", "resolved", "rejected"].includes(status)) {
            throw new Error("invalid_status");
        }
        if (["resolved", "rejected"].includes(status) && (!resolutionNotes || !resolutionNotes.trim())) {
            throw new Error("resolutionNotes_required_to_close_a_dispute");
        }

        dispute.status = status;
        if (["resolved", "rejected"].includes(status)) {
            dispute.resolutionNotes = resolutionNotes;
            dispute.resolvedAt = new Date();
            dispute.resolvedBy = performedBy;
        }
    } else if (resolutionNotes !== undefined) {
        dispute.resolutionNotes = resolutionNotes;
    }

    await dispute.save();

    await auditLog.record({
        actorType: "admin",
        actorRef: performedBy || "unknown_admin",
        action: `dispute.${status ? `status_changed_to_${status}` : "updated"}`,
        entityType: "Dispute",
        entityRef: dispute._id.toString(),
        severity: status && ["resolved", "rejected"].includes(status) ? "warning" : "info",
        metadata: { reference: dispute.reference, assignedTo, status }
    });

    return dispute;
}

module.exports = { raiseDispute, listMyDisputes, getMyDispute, listDisputes, getDispute, updateDispute };
