const { z } = require("zod");

const simulateTransferBody = z.object({
    accountNumber: z.string().trim().min(1, "accountNumber_required"),
    amount: z.coerce.number().positive("amount_must_be_positive"),
    currency: z.string().trim().length(3).optional()
});

module.exports = { simulateTransferBody };
