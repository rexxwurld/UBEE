// src/modules/mfa/mfa.controller.js
const User = require("../auth/user.model");
const otpService = require("../otp/otp.service");
const { comparePassword } = require("../../utils/hash");
const auditLog = require("../audit/auditLog.service");

// POST /api/v1/auth/mfa/enable  (auth)
// Sends a one-time "enable_mfa" OTP - proof the user can actually
// receive codes before MFA is turned on for their account (turning it
// on blind, with no delivery proof, risks a self-lockout the moment
// they next try to log in).
exports.enable = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) throw new Error("user_not_found");
        if (user.mfaEnabled) throw new Error("mfa_already_enabled");

        const { challengeId, expiresAt } = await otpService.generateOtp(user._id, "enable_mfa", user);
        res.json({ status: true, data: { challengeId, expiresAt } });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};

// POST /api/v1/auth/mfa/enable/verify  (auth)
// Body: { challengeId, code }
exports.enableVerify = async (req, res) => {
    try {
        const { challengeId, code } = req.body;
        const { userId } = await otpService.verifyOtp(challengeId, code, "enable_mfa");

        if (userId.toString() !== req.user.id.toString()) {
            // Shouldn't be reachable in normal use (the challenge was
            // created for req.user.id above) - defensive check against
            // someone trying to use a challengeId issued to another
            // session/user.
            throw new Error("challenge_does_not_belong_to_this_user");
        }

        const user = await User.findByIdAndUpdate(userId, { mfaEnabled: true }, { new: true });

        await auditLog.record({
            actorType: "user",
            actorRef: userId.toString(),
            action: "mfa.enabled",
            severity: "warning"
        });

        res.json({ status: true, message: "mfa_enabled" });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};

// POST /api/v1/auth/mfa/disable  (auth)
// Body: { password }
// Requires re-entering the account password - disabling MFA is
// security-relevant enough that it shouldn't be doable purely on the
// strength of an already-open session (e.g. a session left logged in
// on a shared/stolen device).
exports.disable = async (req, res) => {
    try {
        const { password } = req.body;
        const user = await User.findById(req.user.id).select("+password");
        if (!user) throw new Error("user_not_found");

        const valid = await comparePassword(password || "", user.password);
        if (!valid) throw new Error("invalid_password");

        user.mfaEnabled = false;
        user.password = undefined;
        await User.updateOne({ _id: user._id }, { mfaEnabled: false });

        await auditLog.record({
            actorType: "user",
            actorRef: req.user.id.toString(),
            action: "mfa.disabled",
            severity: "critical" // turning OFF a security control is worth standing out in review
        });

        res.json({ status: true, message: "mfa_disabled" });
    } catch (err) {
        res.status(400).json({ status: false, message: err.message });
    }
};
