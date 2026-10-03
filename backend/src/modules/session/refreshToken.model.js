// src/modules/session/refreshToken.model.js
//
// PHASE 10. The old auth flow issued one 7-day cookie-only JWT with no
// refresh mechanism - flagged directly in the audit's §17: "Cookie-
// based JWT is a poor fit for a MAUI app... Does not exist - the JWT is
// a flat 7-day token with no refresh/rotation mechanism." This is the
// fix: short-lived ACCESS tokens (still JWTs, still stateless, still
// checked the same way) backed by long-lived, DB-tracked, revocable
// REFRESH tokens.
//
// A refresh token is a random opaque string, never a JWT - stored here
// only as a HASH (same principle as OTP codes and passwords: even a
// full database read shouldn't hand out something directly usable).
// The plaintext token is returned to the client exactly once, at
// issuance/rotation time, same one-time-visibility pattern as
// Partner.webhookSecret and Adjustment... (see those files' comments).
//
// One row per DEVICE/SESSION, not per user - this is what "list your
// active sessions" / "log out this one device" / "log out everywhere"
// (src/modules/session/session.routes.js) actually operate on.

const mongoose = require("mongoose");

const refreshTokenSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
        tokenHash: { type: String, required: true, unique: true },

        // Free-text, client-supplied at login time (e.g. "iPhone 15 -
        // RexxPay MAUI app", a device name/model string) - purely for
        // the user's own benefit when reviewing their session list, not
        // used for any security decision. Never trust this for auth.
        deviceInfo: { type: String, default: "Unknown device" },
        ip: { type: String, default: null },

        expiresAt: { type: Date, required: true },
        revokedAt: { type: Date, default: null },
        revokedReason: {
            type: String,
            enum: [null, "rotated", "user_logout", "user_revoked_session", "revoke_all"],
            default: null
        },

        lastUsedAt: { type: Date, default: Date.now }
    },
    { timestamps: true }
);

// TTL index: MongoDB automatically removes a document once expiresAt
// has passed - revoked/expired sessions don't need to be kept around
// forever, unlike Adjustment/Transaction/LedgerEntry which are
// permanent financial records. A session row is operational metadata,
// not a financial record.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("RefreshToken", refreshTokenSchema);
