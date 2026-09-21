const { z } = require("zod");

const simulateDepositBody = z.object({
    accountNumber: z.string().trim().min(1, "accountNumber_required"),
    amount: z.coerce.number().positive("amount_must_be_positive"),
    reference: z.string().trim().min(1, "reference_required").max(200),
    rawPayload: z.any().optional()
});

const resolveDepositBody = z.object({
    action: z.enum(["credit", "reject"], { errorMap: () => ({ message: "action_must_be_credit_or_reject" }) }),
    performedBy: z.string().trim().max(200).optional()
});

const resolveDepositParams = z.object({
    id: z.string().trim().min(1)
});

module.exports = { simulateDepositBody, resolveDepositBody, resolveDepositParams };
