const { z } = require("zod");

const createRefundBody = z.object({
    idempotencyKey: z.string().trim().min(1, "idempotencyKey_required"),
    linkedService: z.string().trim().min(1).optional(),
    originalBankReference: z.string().trim().min(1, "originalBankReference_required"),
    destinationAccountNumber: z.string().trim().min(1, "destinationAccountNumber_required"),
    destinationBank: z.string().trim().min(1, "destinationBank_required"),
    destinationAccountName: z.string().trim().max(200).optional(),
    amount: z.coerce.number().positive("amount_must_be_positive"),
    currency: z.string().trim().length(3).optional()
});

const getRefundParams = z.object({
    reference: z.string().trim().min(1)
});

module.exports = { createRefundBody, getRefundParams };
