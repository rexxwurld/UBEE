const { z } = require("zod");

const createPoolAccountBody = z.object({
    label: z.string().trim().max(200).optional(),
    linkedService: z.string().trim().toLowerCase().max(100).optional()
});

const poolStatusQuery = z.object({
    linkedService: z.string().trim().toLowerCase().max(100).optional()
});

const accountNumberParams = z.object({
    accountNumber: z.string().trim().min(1)
});

const assignBody = z.object({
    expectedAmount: z.coerce.number().int().positive().optional()
});

const settlementExportQuery = z.object({
    from: z.string().trim().optional(),
    to: z.string().trim().optional(),
    linkedService: z.string().trim().toLowerCase().max(100).optional()
});

module.exports = { createPoolAccountBody, poolStatusQuery, accountNumberParams, assignBody, settlementExportQuery };
