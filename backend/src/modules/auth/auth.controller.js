const service = require("./auth.service");
const jwt = require("jsonwebtoken");
const auditLog = require("../audit/auditLog.service");
const otpService = require("../otp/otp.service");
const sessionService = require("../session/session.service");
const User = require("./user.model");
const { hashPassword } = require("../../utils/hash");

function issueSessionCookie(res, user) {
    // Kept for backward compatibility with the original web client -
    // web browsers can keep using this cookie exactly as before. A
    // native/mobile client (MAUI) should ignore this cookie entirely
    // and use the accessToken/refreshToken pair in the JSON response
    // body instead (see issueTokenPairResponse below) - that's the
    // actual Phase 10 fix for the audit's "cookie-based JWT is a poor
    // fit for a MAUI app" finding.
    const token = jwt.sign(
        { id: user._id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
    );

    res.cookie("token", token, {
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
        maxAge: 7 * 24 * 60 * 60 * 1000
    });
}

// Issues the bearer token pair AND sets the legacy cookie, so a single
// login/mfa-verify call satisfies both a web client and a mobile
// client with zero server-side knowledge of which kind of client is
// calling - each just uses whichever half of the response it needs.
async function issueFullSession(req, res, user) {
    issueSessionCookie(res, user);

    const deviceInfo = req.headers["x-device-info"] || req.headers["user-agent"] || "Unknown device";
    const { accessToken, refreshToken, expiresIn } = await sessionService.issueTokenPair(user, {
        deviceInfo,
        ip: req.ip
    });

    return { accessToken, refreshToken, expiresIn };
}

exports.register = async (req, res) => {
    try {
        const user = await service.register(req.body);
        await auditLog.record({
            actorType: "user",
            actorRef: user._id.toString(),
            action: "user.registered",
            ip: req.ip
        });
        res.status(201).json({ message: "Registered", user });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const { user } = await service.login(email, password);

        // MFA (Phase 4) - opt-in per user (see user.model.js's
        // mfaEnabled comment for why it's not mandatory by default).
        // If enabled, password-correct is only step one: don't issue a
        // session yet, send an OTP and make the caller complete
        // POST /api/v1/auth/login/mfa-verify with it.
        if (user.mfaEnabled) {
            const { challengeId, expiresAt } = await otpService.generateOtp(user._id, "login", user);

            await auditLog.record({
                actorType: "user",
                actorRef: user._id.toString(),
                action: "user.login_password_ok_awaiting_mfa",
                ip: req.ip
            });

            return res.json({ mfaRequired: true, challengeId, expiresAt });
        }

        const tokens = await issueFullSession(req, res, user);

        await auditLog.record({
            actorType: "user",
            actorRef: user._id.toString(),
            action: "user.login",
            ip: req.ip
        });

        res.json({ message: "Logged in", user, ...tokens });

    } catch (err) {
        // Failed logins matter for security monitoring too - brute force /
        // credential stuffing shows up as a burst of these.
        await auditLog.record({
            actorType: "user",
            action: "user.login_failed",
            ip: req.ip,
            severity: "warning",
            metadata: { email: req.body?.email }
        });
        res.status(400).json({ message: err.message });
    }
};

// POST /api/v1/auth/login/mfa-verify
// Body: { challengeId, code }
// Completes a login that returned { mfaRequired: true } above.
exports.loginMfaVerify = async (req, res) => {
    try {
        const { challengeId, code } = req.body;
        const { userId } = await otpService.verifyOtp(challengeId, code, "login");

        const user = await User.findById(userId);
        if (!user) throw new Error("user_not_found");

        const tokens = await issueFullSession(req, res, user);

        await auditLog.record({
            actorType: "user",
            actorRef: user._id.toString(),
            action: "user.login_mfa_verified",
            ip: req.ip
        });

        res.json({ message: "Logged in", user, ...tokens });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

// POST /api/v1/auth/token/refresh
// Body: { refreshToken }
// The mobile-client equivalent of "the cookie is still valid so keep
// me logged in" - exchanges a still-valid refresh token for a new
// access token AND a new refresh token (rotation - see
// session.service.js:rotateRefreshToken for why the old one is
// revoked, not just left alone).
exports.refreshToken = async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) return res.status(400).json({ message: "refreshToken_required" });

        const deviceInfo = req.headers["x-device-info"] || req.headers["user-agent"];
        const tokens = await sessionService.rotateRefreshToken(refreshToken, { deviceInfo, ip: req.ip });

        res.json({ message: "Token refreshed", ...tokens });
    } catch (err) {
        res.status(401).json({ message: err.message });
    }
};

// POST /api/v1/auth/forgot-password
// Body: { email }
// Always responds the same way regardless of whether the email exists -
// a different response here would let a caller enumerate registered
// emails. If the account exists, a 6-digit password_reset OTP is
// generated (delivered the same way MFA codes are - see
// otp.service.js:deliverOtp; logged to the console in non-production
// since there is no real email/SMS provider wired in yet).
exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });

        if (user) {
            await otpService.generateOtp(user._id, "password_reset", user);
            await auditLog.record({
                actorType: "user",
                actorRef: user._id.toString(),
                action: "user.password_reset_requested",
                ip: req.ip
            });
        }

        res.json({ message: "If that email is registered, a reset code has been sent." });
    } catch (err) {
        // Even on an unexpected error, don't leak whether the email
        // exists - log server-side, respond with the same generic shape.
        res.json({ message: "If that email is registered, a reset code has been sent." });
    }
};

// POST /api/v1/auth/reset-password
// Body: { email, otp, password }
// No challengeId here (unlike login MFA) - the mobile client only has
// the email and the code the user typed, so the OTP is looked up by
// userId+purpose instead (see otp.service.js:verifyOtpForUser).
exports.resetPassword = async (req, res) => {
    try {
        const { email, otp, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) throw new Error("invalid_or_expired_otp");

        await otpService.verifyOtpForUser(user._id, "password_reset", otp);

        user.password = await hashPassword(password);
        await user.save();

        // A password reset invalidates every existing session - anyone
        // holding an old refresh token (including whoever triggered the
        // reset, if that wasn't the account owner) should not stay
        // signed in past this point.
        await sessionService.revokeAllSessions(user._id);

        await auditLog.record({
            actorType: "user",
            actorRef: user._id.toString(),
            action: "user.password_reset_completed",
            ip: req.ip
        });

        res.json({ message: "Password reset. Please sign in with your new password." });
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
};

exports.logout = async (req, res) => {
    res.clearCookie("token");

    // Also revoke the refresh token if the client sent one - a mobile
    // client logging out should actually invalidate its session server-
    // side, not just discard the token locally and leave it usable if
    // it ever leaks.
    const { refreshToken } = req.body || {};
    if (refreshToken) {
        await sessionService.revokeRefreshToken(refreshToken, "user_logout");
    }

    res.json({ message: "Logged out" });
};
