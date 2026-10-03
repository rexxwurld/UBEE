const { z } = require("zod");

const listExceptionsQuery = z.object({
    status: z.enum(["open", "resolved"]).optional()
});

const resolveExceptionBody = z.object({
    notes: z.string().trim().min(1, "notes_required").max(1000)
});

const idParams = z.object({
    id: z.string().trim().min(1)
});

module.exports = { listExceptionsQuery, resolveExceptionBody, idParams };
