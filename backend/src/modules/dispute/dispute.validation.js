const { z } = require("zod");

const raiseBody = z.object({
    relatedType: z.enum(["transaction", "deposit", "payout", "refund", "other"]).optional(),
    relatedEntityRef: z.string().trim().max(200).optional(),
    subject: z.string().trim().min(1, "subject_required").max(200),
    description: z.string().trim().min(1, "description_required").max(5000)
});

const referenceParams = z.object({
    reference: z.string().trim().min(1)
});

const idParams = z.object({
    id: z.string().trim().min(1)
});

const listQuery = z.object({
    status: z.enum(["open", "investigating", "resolved", "rejected"]).optional()
});

const updateBody = z.object({
    status: z.enum(["open", "investigating", "resolved", "rejected"]).optional(),
    assignedTo: z.string().trim().max(200).optional(),
    resolutionNotes: z.string().trim().max(5000).optional()
});

module.exports = { raiseBody, referenceParams, idParams, listQuery, updateBody };
