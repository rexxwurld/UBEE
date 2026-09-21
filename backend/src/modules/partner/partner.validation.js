const { z } = require("zod");

const createPartnerBody = z.object({
    name: z.string().trim().min(1, "name_required").max(200),
    slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]*$/, "slug_must_be_lowercase_alphanumeric_with_hyphens").max(100),
    webhookUrl: z.string().trim().url("webhookUrl_must_be_a_valid_url"),
    webhookSecret: z.string().trim().min(16, "webhookSecret_must_be_at_least_16_characters").optional(),
    contactEmail: z.string().trim().toLowerCase().email("invalid_contactEmail").optional(),
    notes: z.string().trim().max(2000).optional(),
    performedBy: z.string().trim().max(200).optional()
});

const slugParams = z.object({
    slug: z.string().trim().min(1)
});

const statusChangeBody = z.object({
    performedBy: z.string().trim().max(200).optional(),
    reason: z.string().trim().max(1000).optional()
});

const rotateSecretBody = z.object({
    newSecret: z.string().trim().min(16, "newSecret_must_be_at_least_16_characters").optional(),
    performedBy: z.string().trim().max(200).optional()
});

module.exports = { createPartnerBody, slugParams, statusChangeBody, rotateSecretBody };
