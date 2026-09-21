const { z } = require("zod");

// amount arrives as whatever JSON gives us (usually a number already,
// but z.coerce.number() also accepts a numeric string defensively) -
// the actual integer/positivity/limit business rules still live in
// transaction.service.js; this only rejects obviously-wrong shapes
// (missing, non-numeric, zero/negative) before that logic runs.
const transferBody = z.object({
    accountNumber: z.string().trim().min(1, "accountNumber_required"),
    amount: z.coerce.number().positive("amount_must_be_positive"),
    description: z.string().trim().max(500).optional(),
    bank: z.string().trim().max(200).optional(),
    idempotencyKey: z.string().trim().min(1).max(200).optional()
});

const historyQuery = z.object({
    limit: z.coerce.number().int().positive().max(100).optional(),
    before: z.string().trim().regex(/^[0-9a-fA-F]{24}$/, "before_must_be_a_valid_object_id").optional()
});

module.exports = { transferBody, historyQuery };
