const { z } = require("zod");
const { toLocal } = require("../../utils/phone");
const { PIN_LENGTH, PIN_RE, isWeakPin } = require("../../utils/pin");

// Accepts any common way of typing a Nigerian mobile number and turns it
// into the canonical stored form (08160135713).
const phoneField = z.string().trim()
    .transform((v, ctx) => {
        const local = toLocal(v);
        if (!local) { ctx.addIssue({ code: "custom", message: "invalid_nigerian_phone_number" }); return z.NEVER; }
        return local;
    });

const pinField = z.string()
    .regex(PIN_RE, `pin_must_be_${PIN_LENGTH}_digits`)
    .refine((v) => !isWeakPin(v), "pin_too_easy_to_guess");

const registerBody = z.object({
    fullname: z.string().trim().min(1, "fullname_required").max(200),
    email: z.string().trim().toLowerCase().email("invalid_email"),
    phone: phoneField,
    pin: pinField
});

// Login only checks the PIN's shape (not its strength) - strength rules
// apply when a PIN is created, not when it's presented.
const loginBody = z.object({
    phone: phoneField,
    pin: z.string().regex(PIN_RE, `pin_must_be_${PIN_LENGTH}_digits`)
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
    phone: phoneField
});

const resetPasswordBody = z.object({
    phone: phoneField,
    otp: z.string().trim().regex(/^\d{6}$/, "code_must_be_6_digits"),
    pin: pinField
});

module.exports = { registerBody, loginBody, mfaVerifyBody, refreshTokenBody, logoutBody, forgotPasswordBody, resetPasswordBody };
