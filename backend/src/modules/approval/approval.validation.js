const { z } = require("zod");

const createRequestBody = z.object({
    type: z.enum(["adjustment"], { errorMap: () => ({ message: "invalid_approval_type" }) }),
    // payload's own shape is enforced by the underlying action's schema
    // at execution time (e.g. adjustment.validation.js's shape, applied
    // again inside applyAdjustment's own checks) - kept generic here
    // since the approval layer is meant to support multiple action
    // types over time, each with a different payload shape.
    payload: z.record(z.any()),
    requestReason: z.string().trim().min(1, "requestReason_required").max(1000)
});

const idParams = z.object({
    id: z.string().trim().min(1)
});

const rejectBody = z.object({
    reason: z.string().trim().min(1, "reason_required").max(1000)
});

module.exports = { createRequestBody, idParams, rejectBody };
