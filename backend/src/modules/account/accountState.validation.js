const { z } = require("zod");

const updateStateBody = z.object({
    state: z.enum(["active", "frozen", "dormant", "closed"], {
        errorMap: () => ({ message: "invalid_account_state" })
    }),
    reason: z.string().trim().min(1, "reason_required").max(1000),
    performedBy: z.string().trim().max(200).optional()
});

const userIdParams = z.object({
    userId: z.string().trim().min(1)
});

module.exports = { updateStateBody, userIdParams };
