const { z } = require("zod");

const createAdjustmentBody = z.object({
    accountNumber: z.string().trim().min(1, "accountNumber_required"),
    direction: z.enum(["credit", "debit"], { errorMap: () => ({ message: "direction_must_be_credit_or_debit" }) }),
    amount: z.coerce.number().int("amount_must_be_a_whole_number").positive("amount_must_be_positive"),
    reference: z.string().trim().min(1, "reference_required").max(200),
    reason: z.string().trim().min(1, "reason_required").max(1000),
    performedBy: z.string().trim().max(200).optional()
});

module.exports = { createAdjustmentBody };
