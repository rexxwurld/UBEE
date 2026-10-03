const { z } = require("zod");

const searchCustomersQuery = z.object({
    query: z.string().trim().min(2, "query_too_short")
});

const userIdParams = z.object({
    userId: z.string().trim().min(1)
});

const searchTransactionsQuery = z.object({
    accountNumber: z.string().trim().min(1).optional(),
    status: z.enum(["success", "failed", "pending"]).optional(),
    from: z.string().trim().optional(),
    to: z.string().trim().optional(),
    before: z.string().trim().regex(/^[0-9a-fA-F]{24}$/, "before_must_be_a_valid_object_id").optional(),
    limit: z.coerce.number().int().positive().max(200).optional()
});

const transactionIdParams = z.object({
    id: z.string().trim().min(1)
});

module.exports = { searchCustomersQuery, userIdParams, searchTransactionsQuery, transactionIdParams };
