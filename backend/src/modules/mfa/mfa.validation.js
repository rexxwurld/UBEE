const { z } = require("zod");

const enableVerifyBody = z.object({
    challengeId: z.string().trim().min(1, "challengeId_required"),
    code: z.string().trim().regex(/^\d{6}$/, "code_must_be_6_digits")
});

const disableBody = z.object({
    password: z.string().min(1, "password_required")
});

module.exports = { enableVerifyBody, disableBody };
