const { z } = require("zod");

const registerBody = z.object({
    token: z.string().trim().min(1, "token_required"),
    platform: z.enum(["ios", "android", "web"], { errorMap: () => ({ message: "invalid_platform" }) })
});

const tokenParams = z.object({
    token: z.string().trim().min(1)
});

module.exports = { registerBody, tokenParams };
