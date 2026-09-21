const { z } = require("zod");

const submitBody = z.object({
    bvn: z.string().trim().regex(/^\d{11}$/, "bvn_must_be_11_digits").optional(),
    nin: z.string().trim().regex(/^\d{11}$/, "nin_must_be_11_digits").optional(),
    dateOfBirth: z.string().trim().optional() // parsed to a real Date in kyc.service.js; shape-checked as a non-empty string here
}).refine((data) => data.bvn || data.nin, {
    message: "bvn_or_nin_required",
    path: ["bvn"]
});

const verifyBody = z.object({
    approve: z.boolean(),
    tier: z.enum(["tier1", "tier2", "tier3"]).optional(),
    performedBy: z.string().trim().max(200).optional(),
    rejectionReason: z.string().trim().max(1000).optional()
}).refine((data) => !data.approve || !!data.tier, {
    message: "tier_required_when_approving",
    path: ["tier"]
});

const verifyParams = z.object({
    userId: z.string().trim().min(1)
});

module.exports = { submitBody, verifyBody, verifyParams };
