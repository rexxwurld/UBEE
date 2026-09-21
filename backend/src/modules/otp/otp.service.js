// src/modules/otp/otp.service.js
const crypto = require("crypto");
const Otp = require("./otp.model");
const { hashPassword, comparePassword } = require("../../utils/hash");
const auditLog = require("../audit/auditLog.service");

const OTP_TTL_MS = Number(process.env.OTP_TTL_MS || 5 * 60 * 1000); // 5 minutes
const MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS || 5);

function generateNumericCode() {
    // Cryptographically random 6-digit code, zero-padded (crypto.randomInt
    // is uniform and rejection-sampled internally - avoid Math.random()
    // for anything security-relevant).
    return String(crypto.randomInt(0, 1000000)).padStart(6, "0");
}

// STUB - same honest limitation as sendToDestinationBank in
// payout.service.js/refund.service.js: there is no real SMS/email
// provider connected. In non-production, the code is logged to the
// console (clearly marked) so the flow is actually testable end-to-end
// without one. In production, this THROWS rather than silently
// pretending delivery succeeded - an MFA code the user never receives
// is a lockout, not a security feature, and failing loudly here is
// what forces a real provider to be wired in before MFA can be safely
// enabled for real users. Replace this function with a real
// SMS/email/push call before relying on MFA in production.
async function deliverOtp(user, code, purpose) {
    if (process.env.NODE_ENV !== "production") {
        console.log(`[otp] (DEV ONLY - not sent anywhere real) code for ${user.email} (${purpose}): ${code}`);
        return;
    }
    throw new Error(
        "otp_delivery_not_configured: no real SMS/email provider is connected. " +
        "Do not enable MFA for production users until src/modules/otp/otp.service.js:deliverOtp " +
        "is replaced with a real provider integration."
    );
}

async function generateOtp(userId, purpose, user) {
    const code = generateNumericCode();
    const codeHash = await hashPassword(code);

    const otp = await Otp.create({
        userId,
        purpose,
        codeHash,
        expiresAt: new Date(Date.now() + OTP_TTL_MS)
    });

    // If delivery fails (most likely: production with no real provider
    // configured yet), don't leave a usable, undelivered OTP sitting in
    // the database - the whole point of throwing here is that the
    // caller sees a clear error, not a silent "check your phone" that
    // never arrives.
    try {
        await deliverOtp(user, code, purpose);
    } catch (err) {
        await Otp.deleteOne({ _id: otp._id });
        throw err;
    }

    return { challengeId: otp._id.toString(), expiresAt: otp.expiresAt };
}

async function verifyOtp(challengeId, code, purpose) {
    const otp = await Otp.findById(challengeId);

    // Same generic-error principle as adminUser.service.js's login -
    // don't let the error message distinguish "no such challenge" from
    // "wrong code" from "expired", which would help an attacker narrow
    // down what to try next.
    const genericError = () => new Error("invalid_or_expired_otp");

    if (!otp) throw genericError();
    if (otp.purpose !== purpose) throw genericError();
    if (otp.consumedAt) throw genericError();
    if (otp.expiresAt.getTime() < Date.now()) throw genericError();
    if (otp.attempts >= MAX_ATTEMPTS) throw genericError();

    const valid = await comparePassword(String(code || ""), otp.codeHash);
    if (!valid) {
        otp.attempts += 1;
        await otp.save();
        await auditLog.record({
            actorType: "user",
            actorRef: otp.userId.toString(),
            action: "otp.verification_failed",
            severity: "warning",
            metadata: { purpose, attempts: otp.attempts }
        });
        throw genericError();
    }

    otp.consumedAt = new Date();
    await otp.save();

    return { userId: otp.userId };
}

// Same checks as verifyOtp, but looks the challenge up by userId+purpose
// instead of a challengeId - for flows like password reset where the
// client only has the user's email and the code, not a threaded
// challengeId. Picks the most recent still-valid OTP for that user/purpose.
async function verifyOtpForUser(userId, purpose, code) {
    const genericError = () => new Error("invalid_or_expired_otp");

    const otp = await Otp.findOne({
        userId,
        purpose,
        consumedAt: null,
        expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 });

    if (!otp) throw genericError();
    if (otp.attempts >= MAX_ATTEMPTS) throw genericError();

    const valid = await comparePassword(String(code || ""), otp.codeHash);
    if (!valid) {
        otp.attempts += 1;
        await otp.save();
        await auditLog.record({
            actorType: "user",
            actorRef: userId.toString(),
            action: "otp.verification_failed",
            severity: "warning",
            metadata: { purpose, attempts: otp.attempts }
        });
        throw genericError();
    }

    otp.consumedAt = new Date();
    await otp.save();
}

module.exports = { generateOtp, verifyOtp, verifyOtpForUser };
