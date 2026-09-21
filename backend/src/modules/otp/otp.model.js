// src/modules/otp/otp.model.js
//
// Backs MFA (Phase 4). Codes are NEVER stored in plaintext - only a
// bcrypt hash (same hashPassword/comparePassword utility already used
// for account passwords), same principle as password storage: even a
// full database read shouldn't hand out usable codes.

const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

        // "login" - MFA step during sign-in.
        // "enable_mfa" - one-time proof-of-delivery before MFA is turned on.
        // "password_reset" - forgot-password flow (auth.controller.js).
        purpose: { type: String, enum: ["login", "enable_mfa", "password_reset"], required: true },

        codeHash: { type: String, required: true },

        expiresAt: { type: Date, required: true },
        consumedAt: { type: Date, default: null },

        // Wrong-code attempts against THIS specific OTP. Capped
        // (otp.service.js) so a challengeId can't be brute-forced by
        // trying every 6-digit code against one still-valid OTP.
        attempts: { type: Number, default: 0 }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Otp", otpSchema);
