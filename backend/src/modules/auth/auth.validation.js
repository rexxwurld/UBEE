const { z } = require("zod");

const registerBody = z.object({
    fullname: z.string().trim().min(1, "fullname_required").max(200),
    email: z.string().trim().toLowerCase().email("invalid_email"),
    phone: z.string().trim().regex(/^\d{10,15}$/, "phone_must_be_10_to_15_digits"),
    password: z.string().min(8, "password_must_be_at_least_8_characters").max(200)
});

const loginBody = z.object({
    email: z.string().trim().toLowerCase().email("invalid_email"),
    password: z.string().min(1, "password_required")
});

const mfaVerifyBody = z.object({
    challengeId: z.string().trim().min(1, "challengeId_required"),
    code: z.string().trim().regex(/^\d{6}$/, "code_must_be_6_digits")
});

const refreshTokenBody = z.object({
    refreshToken: z.string().trim().min(1, "refreshToken_required")
});

const logoutBody = z.object({
    refreshToken: z.string().trim().min(1).optional()
});

const forgotPasswordBody = z.object({
    email: z.string().trim().toLowerCase().email("invalid_email")
});

const resetPasswordBody = z.object({
    email: z.string().trim().toLowerCase().email("invalid_email"),
    otp: z.string().trim().regex(/^\d{6}$/, "code_must_be_6_digits"),
    password: z.string().min(8, "password_must_be_at_least_8_characters").max(200)
});

module.exports = { registerBody, loginBody, mfaVerifyBody, refreshTokenBody, logoutBody, forgotPasswordBody, resetPasswordBody };
