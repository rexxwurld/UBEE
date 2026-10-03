// src/modules/kyc/kyc.service.js
const User = require("../auth/user.model");
const Transaction = require("../transaction/transaction.model");
const { getLimitsForTier, TIER_LIMITS } = require("../../config/limits");
const { encryptField, hashField } = require("../../utils/fieldEncryption");
const auditLog = require("../audit/auditLog.service");

// Very basic shape checks only - NOT real validation against the BVN/NIN
// check-digit algorithms or, more importantly, against NIBSS/NIMC. That
// real verification is a provider integration (Phase 5-shaped), not
// something this function can honestly claim to do.
function assertPlausibleId(value, label, expectedLength) {
    if (!value || !new RegExp(`^\\d{${expectedLength}}$`).test(String(value))) {
        throw new Error(`${label}_must_be_${expectedLength}_digits`);
    }
}

// Customer self-submits their KYC info. This does NOT raise kycTier -
// it moves kycStatus to "submitted" and stores the data (encrypted),
// pending an admin's verifyKyc call. See user.model.js's comment on why
// tier progression stays a manual gate until a real BVN/NIN verification
// provider exists.
async function submitKyc(userId, { bvn, nin, dateOfBirth }) {
    if (!bvn && !nin) throw new Error("bvn_or_nin_required");
    if (bvn) assertPlausibleId(bvn, "bvn", 11);
    if (nin) assertPlausibleId(nin, "nin", 11);

    const update = {
        kycStatus: "submitted",
        kycSubmittedAt: new Date(),
        kycRejectionReason: null
    };
    if (dateOfBirth) update.dateOfBirth = new Date(dateOfBirth);
    if (bvn) {
        update.bvnHash = hashField(bvn);
        update.bvnEncrypted = encryptField(bvn);
    }
    if (nin) {
        update.ninHash = hashField(nin);
        update.ninEncrypted = encryptField(nin);
    }

    // Catch a duplicate BVN/NIN (someone trying to open a second account
    // against an identity already on file) as a named error rather than
    // a raw Mongo E11000, same spirit as this codebase's other unique-
    // index handling.
    let user;
    try {
        user = await User.findByIdAndUpdate(userId, update, { new: true, runValidators: true });
    } catch (err) {
        if (err.code === 11000) {
            const field = Object.keys(err.keyPattern || {})[0];
            throw new Error(`${field || "identifier"}_already_in_use`);
        }
        throw err;
    }
    if (!user) throw new Error("user_not_found");

    await auditLog.record({
        actorType: "user",
        actorRef: userId.toString(),
        action: "kyc.submitted",
        entityType: "User",
        entityRef: userId.toString(),
        metadata: { hasBvn: !!bvn, hasNin: !!nin }
    });

    return sanitize(user);
}

// Admin approves or rejects a submitted KYC record, and sets the tier
// this customer is now allowed to operate at. requestedTier is required
// on approval - an admin has to explicitly choose it (tier2 requires
// both BVN and NIN on file per current CBN guidance - see limits.js -
// this function enforces that specific precondition; it does not decide
// tier eligibility beyond it, that's still an operator judgment call).
async function verifyKyc(userId, { approve, tier, performedBy = null, rejectionReason = null }) {
    const user = await User.findById(userId);
    if (!user) throw new Error("user_not_found");
    if (user.kycStatus !== "submitted") throw new Error("kyc_not_in_submitted_state");

    if (!approve) {
        user.kycStatus = "rejected";
        user.kycRejectionReason = rejectionReason || "not specified";
        await user.save();

        await auditLog.record({
            actorType: "admin",
            actorRef: performedBy || "unknown_admin",
            action: "kyc.rejected",
            entityType: "User",
            entityRef: userId.toString(),
            severity: "warning",
            metadata: { rejectionReason }
        });
        return sanitize(user);
    }

    if (!["tier1", "tier2", "tier3"].includes(tier)) throw new Error("invalid_tier");
    if (["tier2", "tier3"].includes(tier) && (!user.bvnHash || !user.ninHash)) {
        // Since Dec 2023 CBN guidance, tier2+ requires BOTH BVN and NIN
        // on file - see limits.js's caveat comment on verifying current
        // figures/requirements against the live CBN circular.
        throw new Error("tier2_and_above_require_both_bvn_and_nin");
    }

    user.kycStatus = "verified";
    user.kycTier = tier;
    user.kycVerifiedAt = new Date();
    user.kycVerifiedBy = performedBy;
    user.kycRejectionReason = null;
    await user.save();

    await auditLog.record({
        actorType: "admin",
        actorRef: performedBy || "unknown_admin",
        action: "kyc.verified",
        entityType: "User",
        entityRef: userId.toString(),
        severity: "warning", // tier changes affect transaction limits - worth standing out
        metadata: { tier }
    });

    return sanitize(user);
}

// Same figures transfer() enforces (config/limits.js) - the app renders
// its "Account Limits" table from this instead of hardcoding them, so
// the screen can never disagree with what the server will actually allow.
async function getKycStatus(userId) {
    const user = await User.findById(userId);
    if (!user) throw new Error("user_not_found");

    // Rolling 24h outbound total - identical window to transfer()'s check.
    const dayStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [agg] = await Transaction.aggregate([
        { $match: { sender: user._id, type: "debit", status: { $in: ["success", "pending"] }, createdAt: { $gte: dayStart } } },
        { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);

    return {
        ...sanitize(user),
        limits: getLimitsForTier(user.kycTier),
        dailyOutboundUsed: agg?.total || 0,
        tiers: Object.entries(TIER_LIMITS).map(([tier, l]) => ({ tier, ...l }))
    };
}

// Never return the encrypted blobs or hashes over the API - callers
// only need to know tier/status/submission state.
function sanitize(user) {
    return {
        userId: user._id,
        kycTier: user.kycTier,
        kycStatus: user.kycStatus,
        hasBvn: !!user.bvnHash,
        hasNin: !!user.ninHash,
        dateOfBirth: user.dateOfBirth,
        kycSubmittedAt: user.kycSubmittedAt,
        kycVerifiedAt: user.kycVerifiedAt,
        kycRejectionReason: user.kycRejectionReason
    };
}

module.exports = { submitKyc, verifyKyc, getKycStatus };
