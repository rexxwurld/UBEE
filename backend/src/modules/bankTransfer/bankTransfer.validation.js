const { z } = require("zod");
const { PIN_RE } = require("../../utils/pin");

const accountNumber = z.string().trim().regex(/^\d{10}$/, "account_number_must_be_10_digits");
const bankCode = z.string().trim().min(2, "bankCode_required").max(12);

const nameEnquiryQuery = z.object({ accountNumber, bankCode });

const createBody = z.object({
    accountNumber,
    bankCode,
    amount: z.coerce.number().int("amount_must_be_a_whole_number").positive("amount_must_be_positive"),
    description: z.string().trim().max(100).nullish().transform((v) => v ?? ""),
    idempotencyKey: z.string().trim().min(8).max(100).nullish().transform((v) => v ?? undefined),
    pin: z.string().regex(PIN_RE, "pin_required")
});

module.exports = { nameEnquiryQuery, createBody };
