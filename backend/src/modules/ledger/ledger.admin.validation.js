const { z } = require("zod");

const getWalletLedgerParams = z.object({
    walletId: z.string().trim().min(1)
});

const getWalletLedgerQuery = z.object({
    limit: z.coerce.number().int().positive().max(200).optional(),
    before: z.string().trim().regex(/^[0-9a-fA-F]{24}$/, "before_must_be_a_valid_object_id").optional()
});

module.exports = { getWalletLedgerParams, getWalletLedgerQuery };
