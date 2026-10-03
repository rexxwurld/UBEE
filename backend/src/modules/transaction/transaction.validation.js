const { z } = require("zod");
const { PIN_RE } = require("../../utils/pin");

// amount arrives as whatever JSON gives us (usually a number already,
// but z.coerce.number() also accepts a numeric string defensively) -
// the actual integer/positivity/limit business rules still live in
// transaction.service.js; this only rejects obviously-wrong shapes
// (missing, non-numeric, zero/negative) before that logic runs.
const transferBody = z.object({
    accountNumber: z.string().trim().min(1, "accountNumber_required"),
    amount: z.coerce.number().positive("amount_must_be_positive"),
    // null is accepted as "not provided": the mobile app serializes an empty
    // optional field as JSON null, which plain .optional() would reject.
    description: z.string().trim().max(500).nullish().transform((v) => v ?? undefined),
    bank: z.string().trim().max(200).nullish().transform((v) => v ?? undefined),
    idempotencyKey: z.string().trim().min(1).max(200).nullish().transform((v) => v ?? undefined),
    // Money only moves if the customer re-enters their login PIN.
    pin: z.string().regex(PIN_RE, "pin_required")
});

const historyQuery = z.object({
    limit: z.coerce.number().int().positive().max(100).optional(),
    before: z.string().trim().regex(/^[0-9a-fA-F]{24}$/, "before_must_be_a_valid_object_id").optional()
});

module.exports = { transferBody, historyQuery };
