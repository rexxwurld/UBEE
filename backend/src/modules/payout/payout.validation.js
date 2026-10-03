const { z } = require("zod");

const createPayoutBody = z.object({
    idempotencyKey: z.string().trim().min(1, "idempotencyKey_required"),
    linkedService: z.string().trim().min(1).optional(),
    destinationAccountNumber: z.string().trim().min(1, "destinationAccountNumber_required"),
    destinationBank: z.string().trim().min(1, "destinationBank_required"),
    destinationAccountName: z.string().trim().max(200).optional(),
    amount: z.coerce.number().positive("amount_must_be_positive")
});

module.exports = { createPayoutBody };
