// src/modules/session/session.service.js
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const RefreshToken = require("./refreshToken.model");
const auditLog = require("../audit/auditLog.service");
const env = require("../../config/env");

const ACCESS_TOKEN_TTL = "15m"; // short-lived on purpose - the refresh token is what's actually long-lived now
const REFRESH_TOKEN_TTL_MS = Number(process.env.REFRESH_TOKEN_TTL_MS || 30 * 24 * 60 * 60 * 1000); // 30 days

// Refresh tokens are hashed with plain SHA-256, NOT bcrypt like
// passwords/OTP codes - deliberately. A password/OTP is low-entropy
// (humans pick them, or they're a short numeric code), so a slow,
// salted hash is what makes brute-forcing infeasible. A refresh token
// here is 48 bytes (384 bits) of crypto.randomBytes output - the
// token itself already IS the security margin, and a deterministic
// hash is what lets RefreshToken.findOne({tokenHash}) work as an
// indexed lookup at all (bcrypt's per-call random salt means it can
// never back an equality index - you'd have to bcrypt.compare against
// every row for every user, which doesn't scale).
function hashRefreshToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

function signAccessToken(user) {
    return jwt.sign({ id: user._id, email: user.email }, env.JWT_SECRET, { expiresIn: ACCESS_TOKEN_TTL });
}

// Issues a brand-new access+refresh pair for a fresh login (not a
// rotation - see rotateRefreshToken for that). One RefreshToken row per
// call = one new "session"/device entry.
async function issueTokenPair(user, { deviceInfo, ip } = {}) {
    const refreshTokenPlaintext = crypto.randomBytes(48).toString("hex");

    await RefreshToken.create({
        userId: user._id,
        tokenHash: hashRefreshToken(refreshTokenPlaintext),
        deviceInfo: deviceInfo || "Unknown device",
        ip: ip || null,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS)
    });

    return {
        accessToken: signAccessToken(user),
        refreshToken: refreshTokenPlaintext,
        expiresIn: 15 * 60 // seconds - matches ACCESS_TOKEN_TTL, in a client-friendly unit
    };
}

// Exchanges a still-valid refresh token for a new access token AND a
// new refresh token (rotation) - the OLD refresh token is immediately
// revoked (reason: "rotated"), not left usable. This is what makes a
// stolen-and-later-noticed refresh token detectable: if the legitimate
// client and an attacker both try to use the same refresh token after
// one of them has already rotated it, the second attempt fails outright
// (the token is gone) rather than silently both continuing to work.
async function rotateRefreshToken(refreshTokenPlaintext, { deviceInfo, ip } = {}) {
    const tokenHash = hashRefreshToken(refreshTokenPlaintext);
    const existing = await RefreshToken.findOne({ tokenHash });

    if (!existing || existing.revokedAt || existing.expiresAt.getTime() < Date.now()) {
        throw new Error("invalid_or_expired_refresh_token");
    }

    const User = require("../auth/user.model");
    const user = await User.findById(existing.userId);
    if (!user) throw new Error("user_not_found");

    existing.revokedAt = new Date();
    existing.revokedReason = "rotated";
    await existing.save();

    const newRefreshTokenPlaintext = crypto.randomBytes(48).toString("hex");
    await RefreshToken.create({
        userId: user._id,
        tokenHash: hashRefreshToken(newRefreshTokenPlaintext),
        deviceInfo: deviceInfo || existing.deviceInfo, // carry the device label forward if the client doesn't resend one
        ip: ip || existing.ip,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS)
    });

    return {
        accessToken: signAccessToken(user),
        refreshToken: newRefreshTokenPlaintext,
        expiresIn: 15 * 60
    };
}

async function revokeRefreshToken(refreshTokenPlaintext, reason = "user_logout") {
    const tokenHash = hashRefreshToken(refreshTokenPlaintext);
    await RefreshToken.updateOne(
        { tokenHash, revokedAt: null },
        { $set: { revokedAt: new Date(), revokedReason: reason } }
    );
}

// GET /api/v1/auth/sessions - "which devices am I logged in on."
// Deliberately never returns tokenHash.
async function listActiveSessions(userId) {
    const sessions = await RefreshToken.find({
        userId,
        revokedAt: null,
        expiresAt: { $gt: new Date() }
    }).sort({ lastUsedAt: -1 });

    return sessions.map((s) => ({
        sessionId: s._id,
        deviceInfo: s.deviceInfo,
        ip: s.ip,
        createdAt: s.createdAt,
        lastUsedAt: s.lastUsedAt,
        expiresAt: s.expiresAt
    }));
}

// DELETE /api/v1/auth/sessions/:sessionId - "log out that one device,"
// e.g. a lost/stolen phone, without touching any other active session.
async function revokeSessionById(userId, sessionId) {
    const session = await RefreshToken.findOne({ _id: sessionId, userId });
    if (!session) throw new Error("session_not_found");
    if (session.revokedAt) throw new Error("session_already_revoked");

    session.revokedAt = new Date();
    session.revokedReason = "user_revoked_session";
    await session.save();

    await auditLog.record({
        actorType: "user",
        actorRef: userId.toString(),
        action: "session.revoked",
        entityType: "RefreshToken",
        entityRef: session._id.toString(),
        metadata: { deviceInfo: session.deviceInfo }
    });
}

// POST /api/v1/auth/sessions/revoke-all - "log out everywhere," a
// genuine incident-response action if a user suspects their account is
// compromised, independent of whether they can identify which specific
// session is the bad one.
async function revokeAllSessions(userId, { exceptSessionId } = {}) {
    const filter = { userId, revokedAt: null };
    if (exceptSessionId) filter._id = { $ne: exceptSessionId };

    const result = await RefreshToken.updateMany(filter, {
        $set: { revokedAt: new Date(), revokedReason: "revoke_all" }
    });

    await auditLog.record({
        actorType: "user",
        actorRef: userId.toString(),
        action: "session.revoked_all",
        severity: "warning",
        metadata: { count: result.modifiedCount, keptCurrentSession: !!exceptSessionId }
    });

    return result.modifiedCount;
}

module.exports = {
    signAccessToken,
    issueTokenPair,
    rotateRefreshToken,
    revokeRefreshToken,
    listActiveSessions,
    revokeSessionById,
    revokeAllSessions
};
